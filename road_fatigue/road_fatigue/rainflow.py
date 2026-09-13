"""Rainflow cycle counting (ASTM E1049-85, section 5.4.4).

The algorithm reduces a load history to its reversals (peaks and valleys) and
then walks them with a stack: whenever the most recent range ``X`` is at least
as large as the previous one ``Y``, ``Y`` is closed as a cycle.  A range that
still contains the starting point is closed as a half cycle; after the walk,
every range left in the stack (the residue) is counted as a half cycle.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Cycle:
    """A counted rainflow cycle.

    range : peak-to-valley range of the cycle (same units as the signal)
    mean  : mean of the peak and valley
    count : 1.0 for a full cycle, 0.5 for a half cycle
    i_start, i_end : indices into the original signal of the two reversals
    """

    range: float
    mean: float
    count: float
    i_start: int
    i_end: int

    @property
    def amplitude(self) -> float:
        return 0.5 * self.range


def extract_reversals(y) -> tuple[np.ndarray, np.ndarray]:
    """Indices and values of the reversals (peaks/valleys) of ``y``.

    The first and last samples are always reversals.  Runs of equal values are
    collapsed to their first sample.
    """
    y = np.asarray(y, dtype=float).ravel()
    if y.size == 0:
        return np.empty(0, dtype=int), np.empty(0)
    if y.size == 1:
        return np.array([0]), y.copy()

    # Drop repeated values so that plateaus do not produce zero-length ranges.
    keep = np.concatenate([[True], np.diff(y) != 0.0])
    idx = np.flatnonzero(keep)
    v = y[idx]
    if v.size < 3:
        return idx, v

    d = np.diff(v)
    turning = np.flatnonzero(np.sign(d[:-1]) != np.sign(d[1:])) + 1
    sel = np.concatenate([[0], turning, [v.size - 1]])
    return idx[sel], v[sel]


def count_cycles(y) -> list[Cycle]:
    """Rainflow-count a load history following ASTM E1049-85.

    Returns the cycles in the order they are closed; residue half cycles come last.
    """
    idx, rev = extract_reversals(y)
    cycles: list[Cycle] = []
    if rev.size < 2:
        return cycles

    stack_v: list[float] = []
    stack_i: list[int] = []

    def close(a: int, b: int, count: float) -> None:
        va, vb = stack_v[a], stack_v[b]
        cycles.append(
            Cycle(
                range=abs(vb - va),
                mean=0.5 * (va + vb),
                count=count,
                i_start=int(stack_i[a]),
                i_end=int(stack_i[b]),
            )
        )

    for value, index in zip(rev, idx):
        stack_v.append(float(value))
        stack_i.append(int(index))
        while len(stack_v) >= 3:
            x_range = abs(stack_v[-1] - stack_v[-2])
            y_range = abs(stack_v[-2] - stack_v[-3])
            if x_range < y_range:
                break
            if len(stack_v) == 3:
                # Y contains the starting point: half cycle, drop the first point.
                close(0, 1, 0.5)
                del stack_v[0], stack_i[0]
            else:
                close(-3, -2, 1.0)
                del stack_v[-3:-1], stack_i[-3:-1]

    for k in range(len(stack_v) - 1):
        close(k, k + 1, 0.5)
    return cycles


def cycles_to_arrays(cycles) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Unpack a cycle list into ``(ranges, means, counts)`` arrays."""
    cycles = list(cycles)
    if not cycles:
        return np.empty(0), np.empty(0), np.empty(0)
    ranges = np.array([c.range for c in cycles])
    means = np.array([c.mean for c in cycles])
    counts = np.array([c.count for c in cycles])
    return ranges, means, counts


def total_cycles(cycles) -> float:
    return float(sum(c.count for c in cycles))


def bin_ranges(cycles, bins=32, *, range_max: float | None = None):
    """Histogram of cycle counts by range.

    ``bins`` may be an integer (uniform bins from 0 to ``range_max`` or the
    largest range) or explicit edges.  Returns ``(edges, counts)``.
    """
    ranges, _, counts = cycles_to_arrays(cycles)
    if np.isscalar(bins):
        top = range_max if range_max is not None else (ranges.max() if ranges.size else 1.0)
        edges = np.linspace(0.0, top, int(bins) + 1)
    else:
        edges = np.asarray(bins, dtype=float)
    hist, edges = np.histogram(ranges, bins=edges, weights=counts)
    return edges, hist


def range_mean_matrix(cycles, range_bins=16, mean_bins=16):
    """2-D histogram of counts over (range, mean).

    Returns ``(range_edges, mean_edges, matrix)`` with ``matrix[i, j]`` the count
    in range bin ``i`` and mean bin ``j``.
    """
    ranges, means, counts = cycles_to_arrays(cycles)
    if ranges.size == 0:
        r_edges = np.linspace(0.0, 1.0, int(range_bins) + 1)
        m_edges = np.linspace(-1.0, 1.0, int(mean_bins) + 1)
        return r_edges, m_edges, np.zeros((int(range_bins), int(mean_bins)))
    matrix, r_edges, m_edges = np.histogram2d(
        ranges, means, bins=[range_bins, mean_bins], weights=counts
    )
    return r_edges, m_edges, matrix


def pseudo_damage(cycles, exponent: float = 3.0) -> float:
    """Miner/Basquin pseudo-damage ``sum(n_i * S_i**m)`` (units of range**m)."""
    ranges, _, counts = cycles_to_arrays(cycles)
    return float(np.sum(counts * ranges**exponent))


def equivalent_range(cycles, exponent: float = 3.0, n_eq: float | None = None) -> float:
    """Constant-amplitude range causing the same pseudo-damage in ``n_eq`` cycles.

    By default ``n_eq`` is the total counted number of cycles.
    """
    ranges, _, counts = cycles_to_arrays(cycles)
    if ranges.size == 0:
        return 0.0
    n_eq = total_cycles(cycles) if n_eq is None else float(n_eq)
    if n_eq <= 0:
        raise ValueError("n_eq must be positive")
    return float((np.sum(counts * ranges**exponent) / n_eq) ** (1.0 / exponent))
