import numpy as np
import pytest

from road_fatigue.rainflow import (
    bin_ranges,
    count_cycles,
    cycles_to_arrays,
    equivalent_range,
    extract_reversals,
    pseudo_damage,
    range_mean_matrix,
    total_cycles,
)

ASTM_HISTORY = [-2, 1, -3, 5, -1, 3, -4, 4, -2]


def _aggregate(cycles):
    out = {}
    for c in cycles:
        out[c.range] = out.get(c.range, 0.0) + c.count
    return out


def test_astm_e1049_worked_example():
    cycles = count_cycles(ASTM_HISTORY)
    assert _aggregate(cycles) == {3: 0.5, 4: 1.5, 6: 0.5, 8: 1.0, 9: 0.5}
    assert total_cycles(cycles) == 4.0
    # the closed full cycle E-F (-1, 3) has mean 1 and refers back to the signal indices
    full = [c for c in cycles if c.count == 1.0 and c.range == 4]
    assert len(full) == 1
    assert (full[0].i_start, full[0].i_end) == (4, 5)
    assert full[0].mean == 1.0
    assert full[0].amplitude == 2.0


def test_reversals_include_endpoints_and_skip_plateaus():
    y = [0, 1, 2, 2, 2, 1, 0, 0, 3, 3, 1]
    idx, vals = extract_reversals(y)
    assert list(vals) == [0, 2, 0, 3, 1]
    assert list(idx) == [0, 2, 6, 8, 10]
    # monotone signal: only endpoints
    idx, vals = extract_reversals([1, 2, 3, 4])
    assert list(idx) == [0, 3]
    assert extract_reversals([])[0].size == 0
    assert list(extract_reversals([5, 5, 5])[1]) == [5]


def test_reversals_of_a_sine():
    t = np.linspace(0, 4 * np.pi, 4001)
    idx, vals = extract_reversals(np.sin(t))
    # endpoints + 4 interior extrema
    assert vals.size == 6
    assert np.allclose(np.abs(vals[1:-1]), 1.0, atol=1e-5)


def test_half_cycle_bookkeeping():
    rng = np.random.default_rng(0)
    y = rng.standard_normal(2000)
    cycles = count_cycles(y)
    idx, _ = extract_reversals(y)
    # every consecutive pair of reversals is counted exactly once as a half cycle
    assert total_cycles(cycles) * 2 == idx.size - 1
    ranges, means, counts = cycles_to_arrays(cycles)
    assert np.all(ranges > 0)
    assert set(np.unique(counts)) <= {0.5, 1.0}
    assert np.all(np.abs(means) <= np.abs(y).max())


def test_constant_amplitude_signal_counts_ten_cycles():
    # ASTM E1049 closes a pure periodic signal as a run of half cycles (each range
    # still "contains the starting point"), so check ranges/means and the total.
    t = np.arange(0, 10, 0.001)
    y = 2.0 * np.sin(2 * np.pi * 1.0 * t) + 5.0
    cycles = count_cycles(y)
    big = [c for c in cycles if c.range > 3.0]
    assert all(c.range == pytest.approx(4.0, rel=1e-3) for c in big)
    assert all(c.mean == pytest.approx(5.0, abs=1e-3) for c in big)
    assert total_cycles(big) == pytest.approx(10.0, abs=0.5)
    assert total_cycles(cycles) == pytest.approx(10.0, abs=1.0)


def test_degenerate_inputs():
    assert count_cycles([]) == []
    assert count_cycles([1.0]) == []
    assert count_cycles([1.0, 1.0, 1.0]) == []
    single = count_cycles([0.0, 1.0])
    assert len(single) == 1 and single[0].count == 0.5 and single[0].range == 1.0


def test_matches_reference_rainflow_package():
    rainflow = pytest.importorskip("rainflow")
    rng = np.random.default_rng(123)
    for _ in range(5):
        y = np.cumsum(rng.standard_normal(500))
        ours = sorted((round(c.range, 9), round(c.mean, 9), c.count) for c in count_cycles(y))
        ref = sorted((round(rng_, 9), round(mean, 9), count) for rng_, mean, count, _, _ in rainflow.extract_cycles(y))
        assert ours == ref


def test_binning_and_damage_helpers():
    cycles = count_cycles(ASTM_HISTORY)
    edges, hist = bin_ranges(cycles, bins=[0, 5, 10])
    assert list(edges) == [0, 5, 10]
    assert list(hist) == [2.0, 2.0]
    edges, hist = bin_ranges(cycles, bins=3, range_max=9)
    assert hist.sum() == pytest.approx(4.0)

    r_edges, m_edges, matrix = range_mean_matrix(cycles, 3, 3)
    assert matrix.shape == (3, 3)
    assert matrix.sum() == pytest.approx(4.0)

    # pseudo damage with m = 1 is the count-weighted sum of ranges
    assert pseudo_damage(cycles, 1.0) == pytest.approx(0.5 * 3 + 1.5 * 4 + 0.5 * 6 + 1.0 * 8 + 0.5 * 9)
    # constant amplitude: equivalent range equals that amplitude for any m
    y = np.tile([0.0, 10.0], 50)
    for m in (1.0, 3.0, 5.0):
        assert equivalent_range(count_cycles(y), m) == pytest.approx(10.0)
    assert equivalent_range([], 3.0) == 0.0
    with pytest.raises(ValueError):
        equivalent_range(cycles, 3.0, n_eq=0)
    # empty helpers
    assert bin_ranges([], 4)[1].sum() == 0
    assert range_mean_matrix([], 4, 4)[2].sum() == 0
