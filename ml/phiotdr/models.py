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


def _conv_block(c_in: int, c_out: int, k: int = 7) -> nn.Sequential:
    """Two 1D convolutions (BN + GELU) with a residual shortcut, then halve the time axis."""
    return nn.Sequential(
        _Residual(
            nn.Sequential(
                nn.Conv1d(c_in, c_out, k, padding=k // 2, bias=False), nn.BatchNorm1d(c_out), nn.GELU(),
                nn.Conv1d(c_out, c_out, 5, padding=2, bias=False), nn.BatchNorm1d(c_out),
            ),
            nn.Conv1d(c_in, c_out, 1, bias=False) if c_in != c_out else nn.Identity(),
        ),
        nn.GELU(),
        nn.MaxPool1d(2),
    )


class _Residual(nn.Module):
    def __init__(self, body: nn.Module, shortcut: nn.Module):
        super().__init__()
        self.body, self.shortcut = body, shortcut

    def forward(self, x):
        return self.body(x) + self.shortcut(x)


def _stem(c_out: int) -> nn.Sequential:
    """Strided input convolution: mixes the 12 fiber points and halves the time axis."""
    return nn.Sequential(nn.Conv1d(NUM_POINTS, c_out, 7, stride=2, padding=3, bias=False), nn.BatchNorm1d(c_out), nn.GELU())


class Net1D(nn.Module):
    """Lightweight 1D CNN: the 12 fiber points are input channels, convolution runs along time.
    Strided stem (1000 -> 500 steps), then 4 residual blocks (32-48-64-96 channels) each halving time -> 31 steps.
    Global average + max pooling -> dropout -> linear.
    """

    def __init__(self, num_classes: int = NUM_CLASSES, widths=(32, 48, 64, 96), dropout: float = 0.3):
        super().__init__()
        chans = (widths[0], *widths)
        self.features = nn.Sequential(_stem(widths[0]), *[_conv_block(a, b) for a, b in zip(chans[:-1], chans[1:])])
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * widths[-1], num_classes))

    def embed(self, x: torch.Tensor) -> torch.Tensor:
        return self.features(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        f = self.features(x)
        return self.head(torch.cat([f.mean(-1), f.amax(-1)], 1))


class CNNBiLSTM(nn.Module):
    """Strided stem + 3 residual conv blocks extract local vibration patterns (1000 -> 62 steps),
    a bidirectional LSTM models how they evolve, attention pooling summarises the sequence."""

    def __init__(self, num_classes: int = NUM_CLASSES, widths=(32, 48, 64), hidden: int = 64, dropout: float = 0.3):
        super().__init__()
        chans = (widths[0], *widths)
        self.features = nn.Sequential(_stem(widths[0]), *[_conv_block(a, b) for a, b in zip(chans[:-1], chans[1:])])
        self.lstm = nn.LSTM(widths[-1], hidden, batch_first=True, bidirectional=True)
        self.attn = nn.Linear(2 * hidden, 1)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * hidden, num_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        seq, _ = self.lstm(self.features(x).transpose(1, 2))      # (B, T', 2H)
        w = torch.softmax(self.attn(seq), dim=1)                   # (B, T', 1)
        return self.head((w * seq).sum(1))


class SpecCNN(nn.Module):
    """Short-time Fourier transform of each fiber point (computed inside the model, so the input stays
    (B, 12, T)) -> log-magnitude 12-channel time-frequency image -> small 2D CNN."""

    def __init__(self, num_classes: int = NUM_CLASSES, n_fft: int = 64, hop: int = 32, dropout: float = 0.3):
        super().__init__()
        self.n_fft, self.hop = n_fft, hop
        self.register_buffer("window", torch.hann_window(n_fft), persistent=False)
        self.bn_in = nn.BatchNorm2d(NUM_POINTS)

        def block(a, b):
            return nn.Sequential(nn.Conv2d(a, b, 3, padding=1, bias=False), nn.BatchNorm2d(b), nn.GELU(),
                                 nn.Conv2d(b, b, 3, padding=1, bias=False), nn.BatchNorm2d(b), nn.GELU(),
                                 nn.MaxPool2d(2))

        self.features = nn.Sequential(block(NUM_POINTS, 24), block(24, 48), block(48, 64))
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(2 * 64, num_classes))

    def spectrogram(self, x: torch.Tensor) -> torch.Tensor:
        b, c, t = x.shape
        s = torch.stft(x.reshape(b * c, t), self.n_fft, self.hop, window=self.window, return_complex=True)
        s = torch.log1p(s.abs())                                    # (B*12, F, frames)
        return s.reshape(b, c, *s.shape[-2:])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        f = self.features(self.bn_in(self.spectrogram(x)))
        return self.head(torch.cat([f.mean((-2, -1)), f.amax((-2, -1))], 1))


MODELS = {"paper_cnn": PaperCNN, "net1d": Net1D, "cnn_bilstm": CNNBiLSTM, "spec_cnn": SpecCNN}


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
