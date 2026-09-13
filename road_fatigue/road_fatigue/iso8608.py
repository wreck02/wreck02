"""ISO 8608 road-roughness classification and stochastic profile synthesis.

ISO 8608 describes the vertical road displacement PSD in terms of spatial
frequency ``n`` (cycles/m) as

    G_d(n) = G_d(n0) * (n / n0) ** (-w),     n0 = 0.1 cycles/m,  w = 2

and sorts roads into classes A (very good) to H (very poor) by the value of
``G_d(n0)``.  Each class spans a factor of four in ``G_d(n0)``; the geometric
mean of the class band is the value normally used to represent the class.

A realisation of a profile is synthesised here by the classic
random-phase / fixed-amplitude method: every discrete spatial-frequency bin in
the band ``[n_min, n_max]`` receives a cosine whose amplitude is fixed by the
target PSD and whose phase is drawn uniformly from ``[0, 2*pi)``.  The sum is
evaluated with an inverse real FFT.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import welch

#: Reference spatial frequency, cycles/m.
N0 = 0.1
#: Default waviness exponent.
W = 2.0
#: ISO 8608 lower and upper spatial-frequency limits of the standard band, cycles/m.
N_MIN = 0.011
N_MAX = 2.83

#: Geometric mean of ``G_d(n0)`` for each class, in m^3 (ISO 8608:2016 Table C.2).
CLASS_GEOMETRIC_MEAN: dict[str, float] = {
    "A": 16e-6,
    "B": 64e-6,
    "C": 256e-6,
    "D": 1024e-6,
    "E": 4096e-6,
    "F": 16384e-6,
    "G": 65536e-6,
    "H": 262144e-6,
}

CLASSES = tuple(CLASS_GEOMETRIC_MEAN)


def _normalise_class(road_class: str) -> str:
    key = str(road_class).strip().upper()
    if key not in CLASS_GEOMETRIC_MEAN:
        raise ValueError(f"unknown ISO 8608 road class {road_class!r}; expected one of {CLASSES}")
    return key


def class_limits(road_class: str) -> tuple[float, float]:
    """Lower and upper ``G_d(n0)`` limits (m^3) of an ISO 8608 class.

    Class A has no lower limit (0) and class H no upper limit (inf).
    """
    key = _normalise_class(road_class)
    gm = CLASS_GEOMETRIC_MEAN[key]
    lower = 0.0 if key == "A" else gm / 2.0
    upper = np.inf if key == "H" else gm * 2.0
    return lower, upper


def classify(gd_n0: float) -> str:
    """Return the ISO 8608 class whose ``G_d(n0)`` band contains ``gd_n0``."""
    if not np.isfinite(gd_n0) or gd_n0 <= 0:
        raise ValueError("gd_n0 must be a positive finite number")
    for key in CLASSES:
        lower, upper = class_limits(key)
        if lower <= gd_n0 < upper:
            return key
    return "H"  # unreachable, H has an infinite upper limit


def psd(n, gd_n0: float, w: float = W):
    """Displacement PSD ``G_d(n)`` in m^3 for spatial frequency ``n`` (cycles/m)."""
    n = np.asarray(n, dtype=float)
    with np.errstate(divide="ignore"):
        return gd_n0 * (n / N0) ** (-w)


def class_psd(n, road_class: str, level: str = "mean", w: float = W):
    """PSD of a class at its geometric-mean (default), ``"lower"`` or ``"upper"`` limit."""
    key = _normalise_class(road_class)
    if level == "mean":
        gd = CLASS_GEOMETRIC_MEAN[key]
    elif level == "lower":
        gd = class_limits(key)[0]
    elif level == "upper":
        gd = class_limits(key)[1]
    else:
        raise ValueError("level must be 'mean', 'lower' or 'upper'")
    return psd(n, gd, w)


def band_variance(gd_n0: float, n_min: float = N_MIN, n_max: float = N_MAX, w: float = W) -> float:
    """Analytic variance of the profile, ``int_{n_min}^{n_max} G_d(n) dn`` (m^2)."""
    if w == 1.0:
        return gd_n0 * N0 * np.log(n_max / n_min)
    return gd_n0 * N0**w / (1.0 - w) * (n_max ** (1.0 - w) - n_min ** (1.0 - w))


@dataclass
class RoadProfile:
    """A sampled longitudinal road profile.

    Attributes
    ----------
    x : ndarray
        Longitudinal position, m (uniform spacing ``dx``).
    z : ndarray
        Vertical displacement of the road surface, m.
    dx : float
        Sample spacing, m.
    gd_n0 : float
        Target ``G_d(n0)`` used for synthesis, m^3.
    road_class : str
        ISO 8608 class of ``gd_n0``.
    n_min, n_max : float
        Spatial-frequency band actually synthesised, cycles/m.
    w : float
        Waviness exponent.
    seed : int | None
        Seed used for the random phases (None if an external generator was used).
    """

    x: np.ndarray
    z: np.ndarray
    dx: float
    gd_n0: float
    road_class: str
    n_min: float = N_MIN
    n_max: float = N_MAX
    w: float = W
    seed: int | None = None
    phases: np.ndarray = field(default_factory=lambda: np.empty(0), repr=False)

    @property
    def length(self) -> float:
        """Total length of the profile, m."""
        return self.z.size * self.dx

    @property
    def rms(self) -> float:
        return float(np.sqrt(np.mean(self.z**2)))

    def psd_welch(self, nperseg: int | None = None):
        """Welch estimate of the one-sided displacement PSD.

        Returns ``(n, G)`` with ``n`` in cycles/m and ``G`` in m^3.
        """
        if nperseg is None:
            # Segments long enough to resolve the lowest ISO frequency comfortably.
            nperseg = int(min(self.z.size, max(256, round(4.0 / (self.n_min * self.dx)))))
        n, g = welch(self.z, fs=1.0 / self.dx, window="hann", nperseg=nperseg, detrend="constant")
        return n, g

    def fitted_gd_n0(self, nperseg: int | None = None) -> float:
        """Least-squares (log-log) fit of ``G_d(n0)`` with the waviness fixed at ``w``."""
        n, g = self.psd_welch(nperseg)
        mask = (n >= self.n_min) & (n <= self.n_max) & (g > 0)
        if not np.any(mask):
            raise ValueError("no PSD estimate inside the ISO band; profile too short?")
        return float(np.exp(np.mean(np.log(g[mask]) + self.w * np.log(n[mask] / N0))))

    def fitted_class(self, nperseg: int | None = None) -> str:
        return classify(self.fitted_gd_n0(nperseg))


def synthesize_profile(
    length: float,
    dx: float,
    road_class: str = "F",
    gd_n0: float | None = None,
    *,
    w: float = W,
    n_min: float = N_MIN,
    n_max: float = N_MAX,
    seed: int | None = None,
    rng: np.random.Generator | None = None,
) -> RoadProfile:
    """Synthesise a random-phase road profile with an ISO 8608 PSD.

    Parameters
    ----------
    length : float
        Profile length, m.  Should be several times ``1/n_min`` (about 90 m for the
        ISO band) so that the long-wavelength content is represented.
    dx : float
        Sample spacing, m.  The Nyquist spatial frequency ``1/(2*dx)`` must exceed
        ``n_min``; content above ``min(n_max, Nyquist)`` is left empty.
    road_class : str
        ISO 8608 class, used (via its geometric mean) when ``gd_n0`` is not given.
    gd_n0 : float, optional
        Explicit ``G_d(n0)`` in m^3.  Overrides ``road_class``.
    w : float
        Waviness exponent (ISO default 2).
    n_min, n_max : float
        Synthesised spatial-frequency band, cycles/m.
    seed : int, optional
        Seed for the phase generator.  Ignored when ``rng`` is given.
    rng : numpy.random.Generator, optional
        Generator to draw phases from.
    """
    if length <= 0 or dx <= 0:
        raise ValueError("length and dx must be positive")
    if n_min <= 0 or n_max <= n_min:
        raise ValueError("require 0 < n_min < n_max")

    if gd_n0 is None:
        gd_n0 = CLASS_GEOMETRIC_MEAN[_normalise_class(road_class)]
    elif gd_n0 <= 0:
        raise ValueError("gd_n0 must be positive")
    road_class = classify(gd_n0)

    n_samples = int(round(length / dx))
    if n_samples < 4:
        raise ValueError("profile must contain at least four samples")

    if rng is None:
        rng = np.random.default_rng(seed)
    else:
        seed = None

    n = np.fft.rfftfreq(n_samples, d=dx)  # cycles/m
    dn = 1.0 / (n_samples * dx)
    nyquist = 0.5 / dx
    band = (n >= n_min) & (n <= min(n_max, nyquist))
    if n_samples % 2 == 0:
        band[-1] = False  # Nyquist bin must stay real; keep it empty
    band[0] = False
    if not np.any(band):
        raise ValueError(
            "no spatial-frequency bins fall inside the requested band; "
            "increase the profile length or reduce dx"
        )

    amplitude = np.zeros_like(n)
    amplitude[band] = np.sqrt(2.0 * psd(n[band], gd_n0, w) * dn)
    phases = np.zeros_like(n)
    phases[band] = rng.uniform(0.0, 2.0 * np.pi, size=int(band.sum()))

    # irfft normalises by 1/N and counts each positive bin twice, so a cosine of
    # amplitude A needs a spectral coefficient of magnitude N*A/2.
    spectrum = 0.5 * n_samples * amplitude * np.exp(1j * phases)
    z = np.fft.irfft(spectrum, n=n_samples)
    x = np.arange(n_samples) * dx

    return RoadProfile(
        x=x,
        z=z,
        dx=dx,
        gd_n0=float(gd_n0),
        road_class=road_class,
        n_min=n_min,
        n_max=min(n_max, nyquist),
        w=w,
        seed=seed,
        phases=phases[band],
    )
