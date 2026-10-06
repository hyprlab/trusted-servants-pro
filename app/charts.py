# SPDX-License-Identifier: AGPL-3.0-or-later
"""Chart geometry for the Watchtower dashboards.

The admin charts used to be hand-rolled SVG paths built inside Jinja —
each one its own arithmetic, none of them carrying an axis. Doing the
geometry here instead means a template only has to render what this
module hands it, and every chart on the site gets the same scale, the
same tick placement, and the same hover payload.

Coordinates are plain SVG user units against a fixed viewBox. Callers
never set `preserveAspectRatio="none"`: these charts carry text, and a
non-uniform scale stretches the glyphs along with the plot.

Nothing here touches the database — it takes the roll-up rows that
``watchtower.py`` already produces and turns them into drawable
numbers.
"""
import math

# Plot box. Left padding holds the y-axis tick labels, bottom holds the
# x-axis date labels, and the top band keeps the unit caption clear of
# the topmost tick — all sized so the labels live *inside* the viewBox
# rather than being clipped by the card.
PAD = {"top": 28, "right": 16, "bottom": 30, "left": 52}


def compact(n):
    """Axis-tick number formatting: 28855 -> '29k'. Keeps long y-axis
    labels from eating the plot width on a busy site."""
    try:
        n = float(n)
    except (TypeError, ValueError):
        return "0"
    a = abs(n)
    if a >= 1_000_000:
        s = f"{n / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{s}M"
    if a >= 10_000:
        return f"{round(n / 1000):g}k"
    if a >= 1_000:
        s = f"{n / 1000:.1f}".rstrip("0").rstrip(".")
        return f"{s}k"
    return f"{n:g}"


def nice_axis(data_max, ticks=4):
    """Round ``data_max`` up to a readable axis maximum and return
    ``(axis_max, [tick values])``.

    Steps are drawn from a ladder of readable multipliers x a power of
    ten, so an axis tops out at 32,000 rather than 28,855. The ladder is
    deliberately finer than the usual 1/2/5: with only those three, a max
    of 480 lands on an 800 axis and the data uses barely half the plot
    height. Counts are whole numbers, so any step that would land on a
    fraction is pushed up to the next integer.
    """
    try:
        data_max = float(data_max or 0)
    except (TypeError, ValueError):
        data_max = 0.0
    ticks = max(1, int(ticks))
    if data_max <= 0:
        # Empty window: still draw a real axis so the chart reads as
        # "zero", not "broken".
        return ticks, [i for i in range(ticks + 1)]

    raw_step = data_max / ticks
    mag = 10 ** math.floor(math.log10(raw_step)) if raw_step > 0 else 1
    step = mag * 10
    for m in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if mag * m * ticks >= data_max:
            step = mag * m
            break
    if step < 1:
        step = 1
    else:
        step = math.ceil(step)
    axis_max = step * ticks
    return int(axis_max), [int(step * i) for i in range(ticks + 1)]


def _x_label_stride(n):
    """How many points to skip between x-axis labels so they never
    collide. A 365-day window can't show 365 dates in ~900px."""
    if n <= 1:
        return 1
    for limit, stride in ((10, 1), (16, 2), (32, 3), (70, 7), (130, 14), (400, 30)):
        if n <= limit:
            return stride
    return max(1, n // 12)


def time_chart(rows, series, label_key="day", label_fmt=None,
               width=900, height=260, ticks=4, pad=None):
    """Build everything a line/area chart template needs.

    ``rows``   — the roll-up rows, oldest first.
    ``series`` — ``[{"key", "name", "color", "fill" (optional),
                     "dashed" (optional)}, …]``; ``key`` indexes each row.
    ``label_fmt`` — callable turning a row's label value into axis text.

    Returns a dict of pure numbers and strings. The template does no
    arithmetic; the JSON under ``points`` is what the hover layer reads.
    """
    pad = dict(pad or PAD)
    rows = list(rows or [])
    plot_w = width - pad["left"] - pad["right"]
    plot_h = height - pad["top"] - pad["bottom"]
    plot_x, plot_y = pad["left"], pad["top"]
    base_y = plot_y + plot_h

    def _val(row, key):
        v = row.get(key) if isinstance(row, dict) else getattr(row, key, 0)
        try:
            return float(v or 0)
        except (TypeError, ValueError):
            return 0.0

    def _label(row):
        v = row.get(label_key) if isinstance(row, dict) else getattr(row, label_key, "")
        return label_fmt(v) if label_fmt else str(v)

    data_max = 0.0
    for r in rows:
        for s in series:
            data_max = max(data_max, _val(r, s["key"]))
    axis_max, tick_values = nice_axis(data_max, ticks=ticks)

    n = len(rows)
    # A single data point has no span to spread across, so it sits at the
    # left edge; two or more divide the plot evenly.
    step_x = (plot_w / (n - 1)) if n > 1 else 0.0

    def _x(i):
        return plot_x + (i * step_x if n > 1 else 0)

    def _y(v):
        return base_y - (v / axis_max * plot_h if axis_max else 0)

    y_ticks = [{"value": v, "label": compact(v), "y": round(_y(v), 2)}
               for v in tick_values]

    stride = _x_label_stride(n)
    x_labels = []
    for i, r in enumerate(rows):
        if i % stride == 0 or i == n - 1:
            x_labels.append({"x": round(_x(i), 2), "text": _label(r)})
    # The stride can leave the final two labels almost on top of each
    # other; drop the second-to-last when they'd collide.
    if len(x_labels) > 1 and (x_labels[-1]["x"] - x_labels[-2]["x"]) < (plot_w / 14):
        x_labels.pop(-2)

    out_series = []
    for s in series:
        pts = [{"x": round(_x(i), 2), "y": round(_y(_val(r, s["key"])), 2),
                "v": _val(r, s["key"])} for i, r in enumerate(rows)]
        line = ""
        area = ""
        if pts:
            line = "M " + " L ".join(f"{p['x']} {p['y']}" for p in pts)
            if len(pts) == 1:
                # One point draws nothing as a path; the dot layer carries it.
                line = f"M {pts[0]['x']} {pts[0]['y']} L {pts[0]['x']} {pts[0]['y']}"
            area = (f"M {pts[0]['x']} {base_y} L "
                    + " L ".join(f"{p['x']} {p['y']}" for p in pts)
                    + f" L {pts[-1]['x']} {base_y} Z")
        out_series.append({**s, "points": pts, "line": line, "area": area})

    # One entry per x position, carrying every series' value — the hover
    # layer shows all series at the crosshair, so the pointer never has
    # to find a particular line.
    points = [{
        "x": round(_x(i), 2),
        "label": _label(r),
        # `y` rides along so the hover layer can drop a dot on each
        # series at the crosshair without recomputing the scale in JS.
        "values": [{"key": s["key"], "name": s["name"], "color": s["color"],
                    "v": _val(r, s["key"]), "y": round(_y(_val(r, s["key"])), 2)}
                   for s in series],
    } for i, r in enumerate(rows)]

    return {
        "w": width, "h": height, "pad": pad,
        "plot": {"x": plot_x, "y": plot_y, "w": plot_w, "h": plot_h,
                 "right": plot_x + plot_w, "bottom": base_y},
        "axis_max": axis_max,
        "y_ticks": y_ticks,
        "x_labels": x_labels,
        "series": out_series,
        "points": points,
        "empty": (not rows) or data_max <= 0,
        "rows": rows,
    }


def bar_chart(rows, value_key="count", label_key="hour", label_fmt=None,
              color_fn=None, series_name="Count", series_color="",
              width=900, height=200, ticks=4, pad=None):
    """Same contract as :func:`time_chart` for a categorical bar strip.

    ``color_fn`` maps a value to a fill, so a bar can carry severity
    (the failed-login strip reddens as attempts concentrate) without the
    template holding the thresholds.
    """
    pad = dict(pad or PAD)
    rows = list(rows or [])
    plot_w = width - pad["left"] - pad["right"]
    plot_h = height - pad["top"] - pad["bottom"]
    plot_x, plot_y = pad["left"], pad["top"]
    base_y = plot_y + plot_h

    def _val(row):
        v = row.get(value_key) if isinstance(row, dict) else getattr(row, value_key, 0)
        try:
            return float(v or 0)
        except (TypeError, ValueError):
            return 0.0

    def _label(row):
        v = row.get(label_key) if isinstance(row, dict) else getattr(row, label_key, "")
        return label_fmt(v) if label_fmt else str(v)

    data_max = max([_val(r) for r in rows], default=0)
    axis_max, tick_values = nice_axis(data_max, ticks=ticks)
    y_ticks = [{"value": v, "label": compact(v),
                "y": round(base_y - (v / axis_max * plot_h if axis_max else 0), 2)}
               for v in tick_values]

    n = len(rows)
    slot = (plot_w / n) if n else 0
    # 2px of surface either side of each bar — the gap does the
    # separating, so the bars need no stroke.
    gap = 2.0
    bar_w = max(1.0, slot - gap)

    bars = []
    stride = _x_label_stride(n)
    x_labels = []
    for i, r in enumerate(rows):
        v = _val(r)
        h = (v / axis_max * plot_h) if axis_max else 0
        x = plot_x + i * slot + gap / 2
        bars.append({
            "x": round(x, 2), "y": round(base_y - h, 2),
            "w": round(bar_w, 2), "h": round(h, 2),
            "cx": round(x + bar_w / 2, 2),
            "v": v, "label": _label(r),
            "color": color_fn(v) if color_fn else None,
            # Full-height transparent hit target: a 1px-tall bar is
            # otherwise impossible to hover.
            "hit_x": round(plot_x + i * slot, 2), "hit_w": round(slot, 2),
        })
        if i % stride == 0 or i == n - 1:
            x_labels.append({"x": round(x + bar_w / 2, 2), "text": _label(r)})

    # Same `points` contract as time_chart, so the hover layer and the
    # table-view macro read one shape regardless of chart type. The
    # crosshair snaps to bar centres.
    points = [{
        "x": b["cx"],
        "label": b["label"],
        "values": [{"key": value_key, "name": series_name,
                    "color": b["color"] or series_color, "v": b["v"],
                    "y": b["y"]}],
    } for b in bars]

    return {
        "w": width, "h": height, "pad": pad,
        "plot": {"x": plot_x, "y": plot_y, "w": plot_w, "h": plot_h,
                 "right": plot_x + plot_w, "bottom": base_y},
        "axis_max": axis_max,
        "y_ticks": y_ticks,
        "x_labels": x_labels,
        "bars": bars,
        "points": points,
        "empty": (not rows) or data_max <= 0,
        "rows": rows,
    }
