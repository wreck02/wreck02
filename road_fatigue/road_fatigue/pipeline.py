"""End-to-end analysis: road synthesis -> quarter-car -> rainflow, plus outputs."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .iso8608 import CLASSES, RoadProfile, band_variance, class_psd, synthesize_profile
from .quartercar import QuarterCarParams, QuarterCarResponse, simulate
from .rainflow import (
    Cycle,
    bin_ranges,
    count_cycles,
    cycles_to_arrays,
    equivalent_range,
    pseudo_damage,
    range_mean_matrix,
    total_cycles,
)

# Chart colours (fixed-order categorical slots + text inks + one-hue ramp).
SERIES = ("#2a78d6", "#eb6834", "#1baf7a")
INK = "#0b0b0b"
INK_MUTED = "#52514e"
GRID = "#e6e5e1"
SURFACE = "#fcfcfb"
BLUE_RAMP = ["#fcfcfb", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]


@dataclass
class AnalysisResult:
    profile: RoadProfile
    response: QuarterCarResponse
    cycles: list[Cycle]
    basquin_exponent: float = 3.0

    @property
    def summary(self) -> dict:
        return summarize(self)


def run_analysis(
    road_class: str = "F",
    speed: float = 10.0,
    length: float = 2000.0,
    dx: float = 0.05,
    seed: int | None = 0,
    params: QuarterCarParams | None = None,
    *,
    gd_n0: float | None = None,
    solver: str = "lsim",
    basquin_exponent: float = 3.0,
) -> AnalysisResult:
    """Synthesise a road, drive the quarter car over it and rainflow-count the wheel load."""
    profile = synthesize_profile(length, dx, road_class=road_class, gd_n0=gd_n0, seed=seed)
    response = simulate(profile, speed, params, solver=solver)
    cycles = count_cycles(response.wheel_load)
    return AnalysisResult(profile, response, cycles, basquin_exponent)


def summarize(result: AnalysisResult) -> dict:
    """Scalar summary of an analysis (plain Python types, JSON-serialisable)."""
    p, r, cycles = result.profile, result.response, result.cycles
    ranges, _, counts = cycles_to_arrays(cycles)
    load = r.wheel_load
    f_body, f_hop = r.params.natural_frequencies()
    return {
        "road": {
            "class": p.road_class,
            "gd_n0_m3": p.gd_n0,
            "fitted_gd_n0_m3": p.fitted_gd_n0(),
            "fitted_class": p.fitted_class(),
            "length_m": p.length,
            "dx_m": p.dx,
            "n_min_cpm": p.n_min,
            "n_max_cpm": p.n_max,
            "seed": p.seed,
            "rms_m": p.rms,
            "analytic_rms_m": float(np.sqrt(band_variance(p.gd_n0, p.n_min, p.n_max, p.w))),
        },
        "vehicle": {
            **{k: float(v) for k, v in vars(r.params).items()},
            "speed_mps": r.speed,
            "static_wheel_load_N": r.params.static_wheel_load,
            "body_bounce_Hz": float(f_body),
            "wheel_hop_Hz": float(f_hop),
            "solver": r.solver,
            "dt_s": r.dt,
            "duration_s": float(r.t[-1]),
        },
        "wheel_load": {
            "mean_N": float(np.mean(load)),
            "std_N": float(np.std(load)),
            "min_N": float(np.min(load)),
            "max_N": float(np.max(load)),
            "dynamic_load_coefficient": r.dynamic_load_coefficient,
            "liftoff_fraction": r.liftoff_fraction,
            "sprung_accel_rms_mps2": float(np.sqrt(np.mean(r.sprung_accel**2))),
            "suspension_travel_pk2pk_m": float(np.ptp(r.suspension_travel)),
        },
        "rainflow": {
            "n_cycles": total_cycles(cycles),
            "n_full_cycles": int(np.sum(counts == 1.0)),
            "n_half_cycles": int(np.sum(counts == 0.5)),
            "max_range_N": float(ranges.max()) if ranges.size else 0.0,
            "mean_range_N": float(np.average(ranges, weights=counts)) if ranges.size else 0.0,
            "basquin_exponent": result.basquin_exponent,
            "pseudo_damage": pseudo_damage(cycles, result.basquin_exponent),
            "equivalent_range_N": equivalent_range(cycles, result.basquin_exponent),
        },
    }


def format_summary(summary: dict) -> str:
    """Human-readable, fixed-width rendering of :func:`summarize` output."""
    lines = []
    for section, values in summary.items():
        lines.append(f"[{section}]")
        for key, value in values.items():
            if isinstance(value, float):
                text = f"{value:.6g}"
            else:
                text = str(value)
            lines.append(f"  {key:<28} {text}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# File outputs
# ----------------------------------------------------------------------------


def save_outputs(result: AnalysisResult, out_dir, *, plots: bool = True) -> list[Path]:
    """Write CSV/JSON results (and PNG figures) to ``out_dir``; return the paths."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    p, r, cycles = result.profile, result.response, result.cycles
    written: list[Path] = []

    path = out / "summary.json"
    path.write_text(json.dumps(summarize(result), indent=2))
    written.append(path)

    path = out / "road_profile.csv"
    np.savetxt(path, np.column_stack([p.x, p.z]), delimiter=",", header="x_m,z_m", comments="")
    written.append(path)

    path = out / "wheel_load.csv"
    np.savetxt(
        path,
        np.column_stack(
            [r.t, r.x, r.z_r, r.z_s, r.z_u, r.wheel_load, r.sprung_accel, r.suspension_travel]
        ),
        delimiter=",",
        header="t_s,x_m,z_r_m,z_s_m,z_u_m,wheel_load_N,sprung_accel_mps2,suspension_travel_m",
        comments="",
    )
    written.append(path)

    path = out / "rainflow_cycles.csv"
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["range_N", "mean_N", "count", "i_start", "i_end"])
        for c in cycles:
            writer.writerow([f"{c.range:.6g}", f"{c.mean:.6g}", c.count, c.i_start, c.i_end])
    written.append(path)

    if plots:
        written.extend(save_figures(result, out))
    return written


# ----------------------------------------------------------------------------
# Figures
# ----------------------------------------------------------------------------


def _style(ax, title: str, xlabel: str, ylabel: str) -> None:
    ax.set_title(title, loc="left", color=INK, fontsize=11)
    ax.set_xlabel(xlabel, color=INK_MUTED)
    ax.set_ylabel(ylabel, color=INK_MUTED)
    ax.tick_params(colors=INK_MUTED, labelsize=8)
    ax.grid(True, color=GRID, linewidth=0.6)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.set_facecolor(SURFACE)


def plot_profile(result: AnalysisResult, ax_trace, ax_psd) -> None:
    p = result.profile
    ax_trace.plot(p.x, p.z, color=SERIES[0], linewidth=0.8)
    _style(ax_trace, f"ISO 8608 class {p.road_class} profile (seed {p.seed})", "Distance x, m", "Elevation z, m")

    n, g = p.psd_welch()
    band = (n >= p.n_min) & (n <= p.n_max)
    n_line = np.geomspace(p.n_min, p.n_max, 50)
    for cls in CLASSES:
        ax_psd.plot(n_line, class_psd(n_line, cls, "upper"), color=GRID, linewidth=0.8)
        ax_psd.annotate(
            cls,
            (n_line[0] * 1.15, class_psd(n_line[0] * 1.15, cls, "mean")),
            color=INK_MUTED,
            fontsize=7,
            ha="left",
            va="center",
        )
    ax_psd.plot(n[band], g[band], color=SERIES[0], linewidth=1.2, label="Welch estimate")
    ax_psd.plot(n_line, class_psd(n_line, p.road_class), color=SERIES[1], linewidth=2, label=f"class {p.road_class} target")
    ax_psd.set_xscale("log")
    ax_psd.set_yscale("log")
    _style(ax_psd, "Displacement PSD against ISO 8608 class bands", "Spatial frequency n, cycles/m", "G_d(n), m³")
    ax_psd.legend(frameon=False, fontsize=8, labelcolor=INK_MUTED)


def plot_response(result: AnalysisResult, ax_load, ax_travel) -> None:
    r = result.response
    static = r.params.static_wheel_load
    ax_load.plot(r.x, r.wheel_load, color=SERIES[0], linewidth=0.7, label="wheel load")
    ax_load.axhline(static, color=SERIES[1], linewidth=1.2, label="static load")
    ax_load.axhline(0.0, color=INK_MUTED, linewidth=0.8, linestyle=(0, (4, 3)), label="lift-off")
    _style(ax_load, f"Wheel load at {r.speed:g} m/s", "Distance x, m", "Load, N")
    ax_load.legend(frameon=False, fontsize=8, labelcolor=INK_MUTED, ncol=3, loc="upper right")

    ax_travel.plot(r.x, r.suspension_travel * 1e3, color=SERIES[2], linewidth=0.7)
    _style(ax_travel, "Suspension travel z_s − z_u", "Distance x, m", "Travel, mm")


def plot_rainflow(result: AnalysisResult, ax_hist, ax_matrix, bins: int = 32) -> None:
    cycles = result.cycles
    edges, hist = bin_ranges(cycles, bins)
    width = np.diff(edges)
    ax_hist.bar(edges[:-1], hist, width=width * 0.92, align="edge", color=SERIES[0], edgecolor=SURFACE, linewidth=0.5)
    ax_hist.set_yscale("log")
    m = result.basquin_exponent
    _style(ax_hist, f"Rainflow range histogram ({total_cycles(cycles):g} cycles, S_eq,m={m:g} = {equivalent_range(cycles, m):.0f} N)", "Load range, N", "Cycles")

    r_edges, m_edges, matrix = range_mean_matrix(cycles, bins // 2, bins // 2)
    from matplotlib.colors import LinearSegmentedColormap, LogNorm

    cmap = LinearSegmentedColormap.from_list("blue_ramp", BLUE_RAMP)
    masked = np.ma.masked_where(matrix <= 0, matrix)
    norm = LogNorm(vmin=0.5, vmax=max(1.0, float(matrix.max()))) if matrix.max() > 0 else None
    mesh = ax_matrix.pcolormesh(m_edges, r_edges, masked, cmap=cmap, norm=norm, edgecolors=SURFACE, linewidth=0.3)
    cbar = ax_matrix.figure.colorbar(mesh, ax=ax_matrix, pad=0.02)
    cbar.set_label("Cycles", color=INK_MUTED)
    cbar.ax.tick_params(colors=INK_MUTED, labelsize=8)
    cbar.outline.set_visible(False)
    _style(ax_matrix, "Range–mean matrix", "Cycle mean, N", "Cycle range, N")


def save_figures(result: AnalysisResult, out_dir) -> list[Path]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    specs = (
        ("road_profile.png", plot_profile),
        ("wheel_load.png", plot_response),
        ("rainflow.png", plot_rainflow),
    )
    for name, fn in specs:
        fig, axes = plt.subplots(2, 1, figsize=(9, 7), facecolor=SURFACE)
        fn(result, axes[0], axes[1])
        fig.tight_layout()
        path = out / name
        fig.savefig(path, dpi=130, facecolor=SURFACE)
        plt.close(fig)
        paths.append(path)
    return paths
