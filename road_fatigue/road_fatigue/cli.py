"""Command-line entry point: ``python -m road_fatigue`` or ``road-fatigue``."""

from __future__ import annotations

import argparse
import sys

from .iso8608 import CLASSES
from .pipeline import format_summary, run_analysis, save_outputs, summarize
from .quartercar import QuarterCarParams


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="road-fatigue",
        description="Synthesise an ISO 8608 road, drive a 2-DOF quarter car over it and rainflow-count the wheel load.",
    )
    road = p.add_argument_group("road")
    road.add_argument("--road-class", default="F", choices=CLASSES, help="ISO 8608 class (default F)")
    road.add_argument("--gd-n0", type=float, default=None, help="explicit G_d(n0) in m^3 (overrides --road-class)")
    road.add_argument("--length", type=float, default=2000.0, help="profile length, m (default 2000)")
    road.add_argument("--dx", type=float, default=0.05, help="sample spacing, m (default 0.05)")
    road.add_argument("--seed", type=int, default=0, help="random-phase seed (default 0)")

    veh = p.add_argument_group("vehicle")
    veh.add_argument("--speed", type=float, default=10.0, help="forward speed, m/s (default 10)")
    defaults = QuarterCarParams()
    for name, help_text in (
        ("m_s", "sprung mass, kg"),
        ("m_u", "unsprung mass, kg"),
        ("k_s", "suspension stiffness, N/m"),
        ("c_s", "suspension damping, N s/m"),
        ("k_t", "tyre stiffness, N/m"),
        ("c_t", "tyre damping, N s/m"),
    ):
        veh.add_argument(f"--{name.replace('_', '-')}", type=float, default=getattr(defaults, name), help=f"{help_text} (default {getattr(defaults, name):g})")
    veh.add_argument("--solver", default="lsim", choices=("lsim", "ivp"), help="scipy integrator (default lsim)")

    out = p.add_argument_group("output")
    out.add_argument("--basquin-exponent", type=float, default=3.0, help="S-N slope m for pseudo-damage (default 3)")
    out.add_argument("--out", default=None, help="directory for CSV/JSON/PNG outputs (none written if omitted)")
    out.add_argument("--no-plots", action="store_true", help="skip PNG figures")
    out.add_argument("--json", action="store_true", help="print the summary as JSON instead of text")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    params = QuarterCarParams(m_s=args.m_s, m_u=args.m_u, k_s=args.k_s, c_s=args.c_s, k_t=args.k_t, c_t=args.c_t)
    result = run_analysis(
        road_class=args.road_class,
        speed=args.speed,
        length=args.length,
        dx=args.dx,
        seed=args.seed,
        params=params,
        gd_n0=args.gd_n0,
        solver=args.solver,
        basquin_exponent=args.basquin_exponent,
    )
    summary = summarize(result)
    if args.json:
        import json

        print(json.dumps(summary, indent=2))
    else:
        print(format_summary(summary))

    if args.out:
        paths = save_outputs(result, args.out, plots=not args.no_plots)
        print("\nwritten:")
        for path in paths:
            print(f"  {path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
