"""Diagrams for the report and slides: system pipeline and the Net1D architecture.

Usage:  python ml/scripts/make_diagrams.py      -> results/figures/{pipeline,net1d}.png
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "results" / "figures"
INK, MUTED, ACCENT = "#1f2937", "#6b7280", "#0e7490"


def box(ax, x, y, w, h, title, body, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.04",
                                fc=color + "22", ec=color, lw=1.6))
    ax.text(x + w / 2, y + h - 0.12, title, ha="center", va="top", fontsize=9.5, fontweight="bold", color=INK)
    ax.text(x + w / 2, y + h / 2 - 0.12, body, ha="center", va="center", fontsize=7.8, color=MUTED, linespacing=1.35)


def arrow(ax, x0, y0, x1, y1):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=14, lw=1.4, color=INK))


def pipeline():
    fig, ax = plt.subplots(figsize=(13, 3.6))
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 3.6)
    ax.axis("off")
    steps = [
        ("Φ-OTDR window", "1 s of backscatter\n10,000 pulses\n× 12 points (.mat)", "#64748b"),
        ("Preprocess", "z-score each point\nmean-pool ×10\n→ 12 × 1,000", "#0891b2"),
        ("Net1D", "1D residual CNN\n181k parameters\n~1–3 ms on CPU", "#7c3aed"),
        ("Decision", "6-class softmax\nconf < 0.6: uncertain\ndig: critical alert", "#e11d48"),
        ("FastAPI", "REST + WebSocket\nGrad-CAM / IG\nSQLite event log", "#059669"),
        ("Dashboard", "Next.js: waterfall,\nalerts, analysis,\nevents, models", "#d97706"),
    ]
    w, h, gap, y = 1.9, 2.3, 0.24, 0.6
    for i, (t, b, c) in enumerate(steps):
        x = 0.15 + i * (w + gap)
        box(ax, x, y, w, h, t, b, c)
        if i:
            arrow(ax, x - gap + 0.02, y + h / 2, x - 0.02, y + h / 2)
    ax.text(6.5, 3.3, "From fiber vibration to operator alert", ha="center", fontsize=13, fontweight="bold", color=INK)
    fig.savefig(OUT / "pipeline.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def net1d():
    fig, ax = plt.subplots(figsize=(13, 3.2))
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 3.2)
    ax.axis("off")
    layers = [
        ("Input", "12 × 1000\n(points × time)", "#64748b"),
        ("Stem", "Conv1d k7, s2\nBN + GELU\n32 × 500", "#0891b2"),
        ("Block 1", "2× Conv1d+BN\n+ shortcut\npool → 32 × 250", "#0e7490"),
        ("Block 2", "residual\n→ 48 × 125", "#0e7490"),
        ("Block 3", "residual\n→ 64 × 62", "#0e7490"),
        ("Block 4", "residual\n→ 96 × 31", "#0e7490"),
        ("Pool", "mean ‖ max\nover time\n→ 192", "#7c3aed"),
        ("Head", "dropout 0.3\nlinear → 6\nsoftmax", "#e11d48"),
    ]
    w, h, gap, y = 1.46, 2.0, 0.17, 0.45
    for i, (t, b, c) in enumerate(layers):
        x = 0.1 + i * (w + gap)
        box(ax, x, y, w, h, t, b, c)
        if i:
            arrow(ax, x - gap + 0.02, y + h / 2, x - 0.02, y + h / 2)
    ax.text(6.5, 2.95, "Net1D: the 12 fiber points are input channels, convolution runs along time (181,254 parameters)",
            ha="center", fontsize=12, fontweight="bold", color=INK)
    fig.savefig(OUT / "net1d.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    pipeline()
    net1d()
    print("wrote", OUT / "pipeline.png", OUT / "net1d.png")
