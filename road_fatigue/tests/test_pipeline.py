import json

import numpy as np
import pytest

from road_fatigue.cli import main
from road_fatigue.pipeline import format_summary, run_analysis, save_outputs, summarize


@pytest.fixture(scope="module")
def small_result():
    return run_analysis(road_class="F", speed=10.0, length=400.0, dx=0.1, seed=1)


def test_summary_is_consistent_and_serialisable(small_result):
    s = summarize(small_result)
    json.dumps(s)  # must be plain types
    assert s["road"]["class"] == "F"
    assert s["road"]["length_m"] == pytest.approx(400.0)
    assert s["vehicle"]["speed_mps"] == 10.0
    assert s["vehicle"]["dt_s"] == pytest.approx(0.01)
    assert s["wheel_load"]["mean_N"] == pytest.approx(s["vehicle"]["static_wheel_load_N"], rel=0.05)
    assert 0.0 <= s["wheel_load"]["liftoff_fraction"] <= 1.0
    assert s["rainflow"]["n_cycles"] > 10
    assert s["rainflow"]["n_full_cycles"] + 0.5 * s["rainflow"]["n_half_cycles"] == s["rainflow"]["n_cycles"]
    assert s["rainflow"]["max_range_N"] <= np.ptp(small_result.response.wheel_load) + 1e-9
    assert s["rainflow"]["equivalent_range_N"] <= s["rainflow"]["max_range_N"]
    text = format_summary(s)
    assert "[rainflow]" in text and "equivalent_range_N" in text


def test_class_f_is_rough_enough_to_unload_the_tyre(small_result):
    # A class-F road at 10 m/s produces dynamic loads comparable to the static load.
    assert small_result.response.dynamic_load_coefficient > 0.3


def test_save_outputs_writes_files(small_result, tmp_path):
    paths = save_outputs(small_result, tmp_path / "out")
    names = {p.name for p in paths}
    assert {"summary.json", "road_profile.csv", "wheel_load.csv", "rainflow_cycles.csv",
            "road_profile.png", "wheel_load.png", "rainflow.png"} <= names
    for p in paths:
        assert p.stat().st_size > 0
    data = np.loadtxt(tmp_path / "out" / "wheel_load.csv", delimiter=",", skiprows=1)
    assert data.shape == (small_result.response.t.size, 8)
    cyc = np.loadtxt(tmp_path / "out" / "rainflow_cycles.csv", delimiter=",", skiprows=1)
    assert cyc[:, 2].sum() == pytest.approx(summarize(small_result)["rainflow"]["n_cycles"])


def test_cli_runs_end_to_end(tmp_path, capsys):
    rc = main(["--road-class", "E", "--length", "300", "--dx", "0.1", "--speed", "12",
               "--seed", "4", "--out", str(tmp_path), "--no-plots", "--json"])
    assert rc == 0
    out = capsys.readouterr().out
    summary = json.loads(out.split("\nwritten:")[0])
    assert summary["road"]["class"] == "E"
    assert (tmp_path / "summary.json").exists()
    assert not (tmp_path / "rainflow.png").exists()


def test_cli_text_output_and_ivp_solver(capsys):
    rc = main(["--length", "150", "--dx", "0.1", "--solver", "ivp", "--m-s", "400"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "[wheel_load]" in out
    assert "solver                       ivp" in out
    assert "m_s                          400" in out
