import numpy as np
import pytest

from road_fatigue import iso8608
from road_fatigue.iso8608 import (
    CLASS_GEOMETRIC_MEAN,
    N0,
    band_variance,
    class_limits,
    classify,
    psd,
    synthesize_profile,
)


def test_class_limits_are_contiguous_factor_of_four_bands():
    classes = list(CLASS_GEOMETRIC_MEAN)
    for lo, hi in zip(classes[:-1], classes[1:]):
        assert class_limits(lo)[1] == class_limits(hi)[0]
        assert CLASS_GEOMETRIC_MEAN[hi] == 4 * CLASS_GEOMETRIC_MEAN[lo]
    assert class_limits("A")[0] == 0.0
    assert np.isinf(class_limits("H")[1])
    assert class_limits("F") == (8192e-6, 32768e-6)


def test_classify_round_trips_geometric_means_and_edges():
    for cls, gm in CLASS_GEOMETRIC_MEAN.items():
        assert classify(gm) == cls
    assert classify(8192e-6) == "F"  # lower edge inclusive
    assert classify(32768e-6) == "G"  # upper edge exclusive
    assert classify(1e-9) == "A"
    assert classify(10.0) == "H"
    with pytest.raises(ValueError):
        classify(0.0)


def test_psd_reference_value_and_slope():
    assert psd(N0, 1e-3) == pytest.approx(1e-3)
    assert psd(1.0, 1e-3) == pytest.approx(1e-3 * 0.01)
    assert psd(1.0, 1e-3, w=1.5) == pytest.approx(1e-3 * 0.1**1.5)


def test_band_variance_matches_numerical_integral():
    gd = CLASS_GEOMETRIC_MEAN["F"]
    n = np.linspace(0.011, 2.83, 200_001)
    numeric = np.trapezoid(psd(n, gd), n)
    assert band_variance(gd) == pytest.approx(numeric, rel=1e-6)


def test_synthesised_variance_equals_sum_of_bin_powers():
    prof = synthesize_profile(length=1000.0, dx=0.05, road_class="F", seed=1)
    n = np.fft.rfftfreq(prof.z.size, d=prof.dx)
    dn = 1.0 / (prof.z.size * prof.dx)
    band = (n >= prof.n_min) & (n <= prof.n_max) & (n > 0)
    expected = np.sum(psd(n[band], prof.gd_n0) * dn)
    assert np.mean(prof.z) == pytest.approx(0.0, abs=1e-12)
    assert np.var(prof.z) == pytest.approx(expected, rel=1e-9)
    # and the discrete sum is close to the analytic band integral
    assert np.var(prof.z) == pytest.approx(band_variance(prof.gd_n0), rel=0.05)


def test_synthesised_profile_is_band_limited():
    prof = synthesize_profile(length=500.0, dx=0.05, road_class="C", seed=3)
    spec = np.abs(np.fft.rfft(prof.z))
    n = np.fft.rfftfreq(prof.z.size, d=prof.dx)
    outside = (n < prof.n_min) | (n > prof.n_max)
    assert spec[outside].max() < 1e-9 * spec.max()


@pytest.mark.parametrize("road_class", ["A", "C", "F", "H"])
def test_welch_estimate_lands_in_requested_class(road_class):
    prof = synthesize_profile(length=4000.0, dx=0.05, road_class=road_class, seed=42)
    assert prof.road_class == road_class
    fitted = prof.fitted_gd_n0()
    target = CLASS_GEOMETRIC_MEAN[road_class]
    assert fitted == pytest.approx(target, rel=0.25)
    assert prof.fitted_class() == road_class


def test_seed_reproducibility_and_variation():
    a = synthesize_profile(300.0, 0.1, seed=7)
    b = synthesize_profile(300.0, 0.1, seed=7)
    c = synthesize_profile(300.0, 0.1, seed=8)
    assert np.array_equal(a.z, b.z)
    assert not np.allclose(a.z, c.z)
    # amplitudes identical (same PSD), only phases differ
    assert np.abs(np.fft.rfft(a.z)) == pytest.approx(np.abs(np.fft.rfft(c.z)), rel=1e-9, abs=1e-12)


def test_external_rng_is_used():
    rng = np.random.default_rng(5)
    a = synthesize_profile(300.0, 0.1, rng=rng)
    b = synthesize_profile(300.0, 0.1, rng=np.random.default_rng(5))
    assert a.seed is None
    assert np.array_equal(a.z, b.z)


def test_explicit_gd_n0_overrides_class():
    prof = synthesize_profile(300.0, 0.1, road_class="A", gd_n0=CLASS_GEOMETRIC_MEAN["D"], seed=0)
    assert prof.road_class == "D"
    assert prof.gd_n0 == CLASS_GEOMETRIC_MEAN["D"]


def test_invalid_inputs_raise():
    with pytest.raises(ValueError):
        synthesize_profile(-1.0, 0.1)
    with pytest.raises(ValueError):
        synthesize_profile(100.0, 0.1, road_class="Z")
    with pytest.raises(ValueError):
        synthesize_profile(10.0, 0.1, n_min=1.0, n_max=0.5)
    with pytest.raises(ValueError):
        # far too short: no bin inside the band
        synthesize_profile(2.0, 0.5, n_min=0.011, n_max=0.02)
    with pytest.raises(ValueError):
        iso8608.class_psd(1.0, "F", level="median")
