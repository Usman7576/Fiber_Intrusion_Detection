"""Neural network models. All take input of shape (batch, 12, T): fiber points x time."""

from __future__ import annotations

import torch
from torch import nn

from .config import NUM_CLASSES, NUM_POINTS


class PaperCNN(nn.Module):
    """The authors' 2D CNN baseline (models.py in BJTUSensor/Phi-OTDR_dataset_and_codes),
    adapted from 10,000 to 1,000 time steps by dividing the first layer's time kernel and stride by 10.
    With T=1000 every intermediate shape matches the original: (5,197,12) -> (5,99,7) -> (10,21,8) -> (10,10,4).
    """

    def __init__(self, num_classes: int = NUM_CLASSES):
        super().__init__()
        self.conv1 = nn.Sequential(
            nn.Conv2d(1, 5, kernel_size=(20, 3), stride=(5, 1), padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, padding=1),
        )
        self.conv2 = nn.Sequential(
            nn.Conv2d(5, 10, kernel_size=(20, 2), stride=(4, 1), padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2),
        )
        self.out = nn.Linear(10 * 10 * 4, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.transpose(1, 2).unsqueeze(1)          # (B, 12, T) -> (B, 1, T, 12) as in the original
        x = self.conv2(self.conv1(x))
        return self.out(x.flatten(1))


MODELS = {"paper_cnn": PaperCNN}


def build_model(name: str, **kwargs) -> nn.Module:
    if name not in MODELS:
        raise ValueError(f"unknown model {name!r}; choose from {sorted(MODELS)}")
    return MODELS[name](**kwargs)


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == "__main__":
    for name in MODELS:
        m = build_model(name)
        y = m(torch.randn(2, NUM_POINTS, 1000))
        print(f"{name}: output {tuple(y.shape)}, params {count_params(m):,}")
