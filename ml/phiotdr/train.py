"""Train a neural model on the cached (N, 12, 1000) arrays, CPU-friendly.

Usage:
    python -m phiotdr.train --model paper_cnn --epochs 50 --lr 1e-4 --batch-size 100
    python -m phiotdr.train --model net1d --augment --epochs 40 --lr 1e-3

Picks the epoch with the best validation accuracy, then evaluates once on the official test split.
Writes ml/models/<run>.pt (+ .json config) and results/metrics_<run>.json, confusion_<run>.png, history_<run>.csv
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import time

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from .config import CLASS_NAMES, DOWNSAMPLE, MODELS_DIR, NORMALISE, PROCESSED_DIR, RESULTS_DIR, SEED
from .evaluate import compute_metrics, measure_latency, save_report, summary_line
from .models import build_model, count_params
from .preprocess import augment


class ArrayDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray, train_aug: bool = False, seed: int = SEED):
        self.X, self.y, self.aug = X, y, train_aug
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        x = self.X[i].astype(np.float32)
        if self.aug:
            x = augment(x, self.rng)
        return torch.from_numpy(x), int(self.y[i])


def load_split(split: str):
    X = np.load(PROCESSED_DIR / f"{split}_X.npy")
    y = np.load(PROCESSED_DIR / f"{split}_y.npy")
    meta = pd.read_csv(PROCESSED_DIR / f"{split}_meta.csv")
    return X, y, meta


@torch.no_grad()
def predict(model: nn.Module, loader: DataLoader) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    probs, ys = [], []
    for xb, yb in loader:
        probs.append(torch.softmax(model(xb), 1).numpy())
        ys.append(yb.numpy())
    return np.concatenate(probs), np.concatenate(ys)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--run-name")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-5)
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--patience", type=int, default=10, help="early stopping on validation accuracy")
    ap.add_argument("--augment", action="store_true")
    ap.add_argument("--dig-weight", type=float, default=1.0, help="extra loss weight on the dig class")
    ap.add_argument("--scheduler", choices=["none", "cosine", "plateau"], default="none")
    ap.add_argument("--threads", type=int, default=os.cpu_count())
    ap.add_argument("--seed", type=int, default=SEED)
    args = ap.parse_args(argv)
    run = args.run_name or args.model

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(args.threads)

    X, y, meta = load_split("train")
    Xte, yte, _ = load_split("test")
    is_val = meta["is_val"].to_numpy()
    train_ds = ArrayDataset(X[~is_val], y[~is_val], train_aug=args.augment, seed=args.seed)
    val_ds, test_ds = ArrayDataset(X[is_val], y[is_val]), ArrayDataset(Xte, yte)
    g = torch.Generator().manual_seed(args.seed)
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, generator=g)
    val_dl = DataLoader(val_ds, batch_size=256)
    test_dl = DataLoader(test_ds, batch_size=256)
    print(f"{run}: train {len(train_ds)}  val {len(val_ds)}  test {len(test_ds)}  threads {args.threads}")

    model = build_model(args.model)
    n_params = count_params(model)
    print(f"params: {n_params:,}")
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = None
    if args.scheduler == "cosine":
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    elif args.scheduler == "plateau":
        sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, mode="max", factor=0.5, patience=3)
    weights = torch.ones(len(CLASS_NAMES))
    weights[CLASS_NAMES.index("dig")] = args.dig_weight
    loss_fn = nn.CrossEntropyLoss(weight=weights)

    history, best_acc, best_state, best_epoch, bad = [], -1.0, None, 0, 0
    t_start = time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, total, correct, loss_sum = time.perf_counter(), 0, 0, 0.0
        for xb, yb in train_dl:
            opt.zero_grad()
            out = model(xb)
            loss = loss_fn(out, yb)
            loss.backward()
            opt.step()
            loss_sum += loss.item() * len(yb)
            correct += (out.argmax(1) == yb).sum().item()
            total += len(yb)
        vp, vy = predict(model, val_dl)
        val_acc = float((vp.argmax(1) == vy).mean())
        if sched is not None:
            sched.step(val_acc) if args.scheduler == "plateau" else sched.step()
        history.append({"epoch": epoch, "train_loss": loss_sum / total, "train_acc": correct / total,
                        "val_acc": val_acc, "lr": opt.param_groups[0]["lr"], "seconds": time.perf_counter() - t0})
        flag = ""
        if val_acc > best_acc:
            best_acc, best_state, best_epoch, bad, flag = val_acc, copy.deepcopy(model.state_dict()), epoch, 0, " *"
        else:
            bad += 1
        print(f"epoch {epoch:3d}  loss {loss_sum / total:.4f}  train {correct / total:.2%}  "
              f"val {val_acc:.2%}  ({history[-1]['seconds']:.0f}s){flag}", flush=True)
        if bad >= args.patience:
            print(f"early stop: no improvement for {args.patience} epochs")
            break

    model.load_state_dict(best_state)
    tp, ty = predict(model, test_dl)
    m = compute_metrics(ty, tp.argmax(1))
    model.eval()
    sample = torch.from_numpy(Xte[0:1].astype(np.float32))
    with torch.no_grad():
        m["latency_ms"] = measure_latency(lambda s: model(s), sample)
    m.update(model=args.model, params=n_params, best_epoch=best_epoch, best_val_acc=best_acc,
             train_minutes=round((time.perf_counter() - t_start) / 60, 1), config=vars(args))
    print(summary_line(run, m), f"params {n_params:,}  latency {m['latency_ms']:.2f} ms  best epoch {best_epoch}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(best_state, MODELS_DIR / f"{run}.pt")
    (MODELS_DIR / f"{run}.json").write_text(json.dumps({
        "model": args.model, "classes": CLASS_NAMES, "downsample": DOWNSAMPLE, "normalise": NORMALISE,
        "params": n_params, "test_accuracy": m["accuracy"]}, indent=2))
    save_report(run, m)
    pd.DataFrame(history).to_csv(RESULTS_DIR / f"history_{run}.csv", index=False)


if __name__ == "__main__":
    main()
