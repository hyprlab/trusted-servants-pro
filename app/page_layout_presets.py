# SPDX-License-Identifier: AGPL-3.0-or-later
"""Content-carrying page layout presets.

The presets in ``_seed_page_layouts`` (app/__init__.py) are mostly
empty shapes. The ones here ship their copy too: every heading,
paragraph, list item and button label sits in the block's ``data``,
which ``_instantiate_preset_entry`` merges onto the blank block when a
page is created from the layout. The page that results is ordinary
page-builder content, so every word stays editable in the page editor.

Colors are design tokens (``token:<key>``) so the page follows the
active theme and its dark mode instead of fixing hex values.
"""

# ── Small builders ─────────────────────────────────────────────────

CARD_BG = "token:color_card_primary_bg"
CARD_BG_DARK = "token:color_card_primary_bg_dark"
CARD_BORDER = "token:color_card_primary_border"
CARD_BORDER_DARK = "token:color_card_primary_border_dark"
BRAND = "token:color_brand"
SOFT_TEXT = "token:color_text_soft"
SOFT_TEXT_DARK = "#a3acb9"


def _box(blocks, **data):
    return {"type": "container", "data": data, "blocks": blocks}


def _heading(text, level=2, **data):
    return {"type": "heading", "data": {"text": text, "level": level, **data}}


def _para(md, **data):
    return {"type": "paragraph", "data": {"md": md, **data}}


def _list(items, **data):
    return {"type": "list", "data": {"items": list(items), **data}}


def _button(label, url, style="primary", new_tab=False, align="left"):
    return {"type": "button", "data": {"label": label, "url": url, "style": style,
                                       "new_tab": new_tab, "align": align}}


def _icon_tile(name):
    """A Lucide icon in a soft rounded tile, held left by a row so the
    tile keeps its own width on phones too."""
    tile = _box([{"type": "icon", "data": {"name": name, "size": 22, "color": BRAND,
                                           "align": "center"}}],
                label="Icon tile", display="flex", direction="row",
                justify="center", align="center", gap="0", padding="0.75rem",
                bg_color="token:color_surface_alt", bg_color_dark="token:color_surface_dark",
                bg_color_dark_mode="manual", border_radius=12)
    return _box([tile], label="Icon row", display="flex", direction="row",
                mobile_direction="row", justify="flex-start", align="center",
                gap="0", padding="0")


def _card(blocks, label, padding="2rem", **extra):
    data = dict(label=label, display="flex", direction="column", gap="1rem",
                padding=padding, padding_mobile="1.5rem",
                bg_color=CARD_BG, bg_color_dark=CARD_BG_DARK, bg_color_dark_mode="manual",
                border_width=1, border_color=CARD_BORDER,
                border_color_dark=CARD_BORDER_DARK, border_color_dark_mode="manual",
                border_radius=18, shadow="sm")
    data.update(extra)
    return _box(blocks, **data)


def _section_heading(text, intro=None):
    blocks = [_heading(text, 2, align="center", font_size="clamp(1.6rem, 3vw, 2rem)",
                       font_weight="800")]
    if intro:
        blocks.append(_para(intro, align="center", color=SOFT_TEXT,
                            color_dark=SOFT_TEXT_DARK, color_dark_mode="manual"))
    return _box(blocks, label="Section heading", display="flex", direction="column",
                align="center", gap="0.5rem", padding="0", width_mode="boxed",
                max_width=720)


# ── Intergroup Elections ───────────────────────────────────────────
# Copy imported from the DC CMA WordPress page "2026 Intergroup
# Elections". Each position is (title, icon, duties, term, voting).

_POSITIONS = [
    ("Chair", "flag", [
        "Presides over each monthly Intergroup meeting using Robert’s Rules of Order, Revised In Brief as a guide in conducting business.",
        "Ensures that an agenda is created and distributed for each Intergroup meeting.",
        "Ensures that talking points and announcements of interest to the fellowship and consistent with the Fifth Tradition are made available to Intergroup members following each Intergroup meeting.",
        "Acts as an ex-officio member of all committees without voting rights.",
    ], "1 year", "Tie-breaking vote only"),
    ("Secretary", "file-text", [
        "Calls roll at each Intergroup meeting and reports whether a quorum exists.",
        "Records minutes of each Intergroup meeting and maintain records of each meeting. At a minimum, minutes should record whether a quorum was met, documentation of all motions made (discussion and action taken), results of any elections, and any items to be carried over to the following months as old business. If available, minutes should also include standing and ad hoc committee reports, reports from GSRs on the well-being and needs of their groups, and other items discussed by the Intergroup.",
        "Tabulates votes on motions made at Intergroup meetings.",
        "Distributes (via email) draft meeting minutes to Intergroup members prior to the next scheduled Intergroup meeting.",
        "Delivers report on “old business” at each Intergroup meeting.",
        "Ensures meeting minutes and other Intergroup records are electronically archived.",
    ], "1 year", "Yes"),
    ("Treasurer", "wallet", [
        "Maintains Intergroup’s bank account(s).",
        "Receives and deposits funds from individual CMA groups.",
        "Distributes funds to pay approved expenses.",
        "Consults with Intergroup officers to develop annual budget and submit for approval.",
        "If the Chair is unable to perform his or her duties, the Treasurer will perform all the duties of the Chair. When so acting, the Treasurer shall have all powers of and be subject to all restrictions of the Chair.",
        "Provides monthly and annual reports as described in Article VII.",
    ], "1 year", "Yes"),
    ("Activities Chair", "sparkles", [
        "Planning, organizing and coordinating social activities and events for CMA members according to surveyed interests.",
        "Ensuring access to activities and events for CMA members with limited financial resources to nurture fellowship.",
        "Coordinating promotion of activities and events at DCCMA meetings.",
        "Encouraging and promoting newcomer participation in DCCMA social activities.",
        "Assisting with the maintenance of information provided to the public on Intergroup’s website.",
        "Forming subcommittees as needed to achieve social activity-related goals set by Intergroup.",
        "Delivering a report on committee activities at each Intergroup meeting.",
    ], "1 year", "No"),
    ("Hospitals & Institutions Chair", "stethoscope", [
        "Coordinating activities related to bringing CMA meetings to area hospitals and institutions including outreach and liaison to such facilities, determining the time and format of meetings, and securing trusted servants and speakers from among DCCMA members.",
        "Providing outreach and information about DCCMA, including General Services Conference-approved literature and information about meetings offered in the DC Intergroup region, to medical, mental health, corrections, and other professionals in institutions that provide services to crystal meth addicts.",
        "Actively encouraging representation of DCCMA in monthly CMA General Service Hospitals and Institutions Subcommittee conference calls.",
        "Forming subcommittees as needed to achieve hospitals and institutions-related goals set by Intergroup.",
    ], "1 year", "No"),
    ("Literature Chair", "book-open", [
        "Coordinating activities related to publishing pamphlets, newcomer packets, and other Intergroup literature.",
        "Actively encouraging representation of DCCMA in monthly CMA General Service Literature Subcommittee conference calls.",
        "Forming subcommittees as needed to achieve literature-related goals set by Intergroup.",
        "Helping to maintain information provided to the public on the Intergroup’s website.",
        "Assisting individual CMA meeting GSRs with acquiring literature and chips for their respective meetings.",
        "Maintaining an up-to-date inventory of literature and chips on hand.",
        "Delivering a report on committee activities at each Intergroup meeting.",
    ], "1 year", "No"),
    ("Public Information & Communications Chair", "megaphone", [
        "Managing all technical aspects of the [DCCMA website](/).",
        "Responding to routine requests for information from individuals and the media; or referring such requests to Intergroup for approval or action.",
        "Delivering a report on committee activities at each Intergroup meeting.",
        "Actively encouraging representation of DCCMA in monthly CMA General Service Public Information Subcommittee and CMA General Service Communications Subcommittee conference calls.",
        "Maintaining an electronic archive of Intergroup records.",
    ], "1 year", "No"),
    ("Area Delegates to the General Service Conference", "globe", [
        "Fulfill the responsibilities of an Area Delegate as set forth by the GSC of the worldwide CMA service structure, including carrying the conscience of the meetings they represent to the General Service Conference.",
        "Each CMA Area with meetings represented in the Intergroup is entitled to have up to two (2) Area Delegates serve as voting members of the Intergroup.",
        "Meetings from a given CMA Area choose their Delegates to the General Service Conference in accordance with guidelines set by the GSC.",
    ], "1 year", "Yes"),
    ("Mid-Atlantic Regional Representative", "map", [
        "Carries the conscience of the DC District and Area to the Regional Conference.",
        "Organizes and coordinates the Regional Conference when hosted in an Area serviced by the Intergroup.",
        "Liaises to other Areas within the Mid-Atlantic Region.",
    ], "2 years", "No"),
]

_STEPS = [
    "**Announcement of Upcoming Elections.** At the Fall Intergroup meetings, the Chair will advise the Intergroup of officer and committee chair elections that will take place at the following month’s Intergroup meeting. GSRs should announce these upcoming elections at their meetings.",
    "**Nomination.** At the December Intergroup meeting, the Chair will solicit nominations for officer and committee chair positions. An explanation of the position’s duties and responsibilities will be provided. Any active CMA member may nominate a candidate for Intergroup officers or committee chair positions.",
    "**Willingness to Serve.** Only nominees who are present or have provided written expression of their willingness to serve to the Intergroup are eligible to be elected.",
    "**Voting Privileges.** Only Intergroup members with voting privileges or their designated proxy may vote in elections. The Chair may vote in elections only to break a tie.",
    "**Lack of a Majority.** When there are multiple nominees and no nominee receives a majority of votes in the first ballot, the nominee with the fewest votes will be dropped and another vote will be taken. This process will be repeated until a nominee receives a majority vote.",
    "**Succession.** All Intergroup members and officers may succeed themselves in service, but in keeping with the Ninth Tradition and the principle of rotating leadership, it is recommended that no officer serve more than two (2) consecutive terms.",
    "**Vacancies.** Should any position other than GSR or Area Delegate to the General Service Conference become vacant before expiration of the incumbent’s term, the Intergroup will elect someone to serve the remainder of that term.",
    "**Terms of Office.** The terms for all Intergroup positions except GSR will begin on January 1. Individual CMA groups determine when their GSRs’ terms begin and end.",
]


def _anchor(title):
    """The id the page renderer stamps on a heading (frontend.
    _collect_page_headings), so the position list can link to each
    position card."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def _fact(label, value):
    return _box([
        _para(label, font_size="0.8rem", font_weight="600", color=SOFT_TEXT,
              color_dark=SOFT_TEXT_DARK, color_dark_mode="manual"),
        _para(value, font_size="0.975rem", font_weight="700"),
    ], label=label, display="flex", direction="column", gap="0.1rem", padding="0")


def _position_card(title, icon_name, duties, term, voting):
    top = _box([
        _icon_tile(icon_name),
        _heading(title, 3, font_size="1.3rem", font_weight="700", line_height="1.3"),
        _list(duties, display_style="checklist", font_size="0.95rem"),
    ], label=title, display="flex", direction="column", gap="0.85rem", padding="0")
    footer = _box([
        {"type": "separator", "data": {}},
        _box([_fact("Term", term), _fact("Voting member", voting)],
             label="Term and vote", display="flex", direction="row",
             mobile_direction="row", wrap=True, justify="flex-start",
             align="flex-start", gap="0.75rem 2.5rem", padding="0"),
    ], label="Card footer", display="flex", direction="column", gap="1rem",
       padding="0")
    return _card([top, footer], f"{title} card", padding="1.75rem",
                 justify="space-between", gap="1.25rem", hover_shadow="md")


def intergroup_elections():
    header = _box([
        _para("Officer and Committee Chairs", align="center", color=BRAND,
              font_weight="600", font_size="0.95rem"),
        _heading("2026 Intergroup Elections", 1, align="center",
                 font_size="clamp(2.25rem, 5vw, 3.25rem)", font_weight="800",
                 line_height="1.1"),
        _para("Every year new trusted servants are elected to the DC CMA Intergroup. "
              "These trusted servants support the fellowship by running monthly "
              "meetings, distributing literature, plan events and so much more. It is "
              "an exciting way to be of service to the local fellowship. Below are "
              "instructions for our election procedures and a list of descriptions and "
              "requirements for these positions. If you are looking for a new way to get "
              "involved with CMA and eager to serve the fellowship, check out the "
              "descriptions and attend our next DC CMA Intergroup meeting on the last "
              "Tuesday of the month.",
              align="center", font_size="1.075rem", line_height="1.7",
              color=SOFT_TEXT, color_dark=SOFT_TEXT_DARK, color_dark_mode="manual"),
        _box([_button("Current Officers", "/intergroup", "secondary", align="center")],
             label="Header actions", display="flex", direction="row",
             mobile_direction="row", justify="center", align="center", gap="0.75rem",
             padding="0.5rem 0 0"),
    ], label="Page header", display="flex", direction="column", align="center",
       gap="1rem", padding="3rem 0 1rem", padding_mobile="1.5rem 0 0.5rem",
       width_mode="boxed", max_width=780)

    election_card = _card([
        _icon_tile("calendar-check"),
        _heading("2026 Elections for all positions will be held December 16th at "
                 "8:30pm EST on Zoom", 2, font_size="1.45rem", font_weight="700",
                 line_height="1.35"),
        _para("**Meeting ID:** 827 9426 1352  \n**Passcode:** 20302030",
              line_height="1.8"),
        _box([_button("Join Zoom Meeting",
                      "https://us02web.zoom.us/j/82794261352?pwd=T2pXR25LYmwvS01zYkw3VXlCUzBqQT09",
                      "primary", new_tab=True)],
             label="Zoom action", display="flex", direction="row",
             mobile_direction="row", justify="flex-start", gap="0.75rem",
             padding="0.25rem 0 0"),
    ], "Election meeting card", justify="center")

    positions_card = _card([
        _icon_tile("check-circle"),
        _heading("Positions Up for Election", 2, font_size="1.45rem",
                 font_weight="700", line_height="1.35"),
        _list([f"[{title}](#{_anchor(title)}) · Available"
               for title, *_ in _POSITIONS], display_style="checklist",
              font_size="0.975rem"),
    ], "Open positions card")

    overview = _box([election_card, positions_card], label="Election overview",
                    display="grid", grid_columns="repeat(2, minmax(0, 1fr))",
                    gap="1.5rem", align="stretch", padding="1.5rem 0")

    how = _box([
        _section_heading("How our Elections Work"),
        _list(_STEPS, ordered=True, display_style="cards", card_bg=CARD_BG,
              card_bg_dark=CARD_BG_DARK, card_bg_dark_mode="manual",
              card_border_color=CARD_BORDER, card_border_color_dark=CARD_BORDER_DARK,
              card_border_color_dark_mode="manual", card_border_radius="16px",
              card_gap="0.85rem", card_hover_lift=False),
    ], label="How our elections work", display="flex", direction="column",
       gap="1.75rem", padding="2.5rem 0 1.5rem", width_mode="boxed", max_width=880)

    positions = _box([
        _section_heading("Descriptions and Requirements",
                         "What each officer and committee chair does, how long the "
                         "term runs, and whether the position votes at Intergroup."),
        _box([_position_card(*p) for p in _POSITIONS], label="Position cards",
             display="grid", grid_columns="repeat(3, minmax(0, 1fr))",
             gap="1.25rem", align="stretch", padding="0"),
    ], label="Position descriptions", display="flex", direction="column",
       gap="1.75rem", padding="2.5rem 0 3rem")

    return {
        "key": "page-intergroup-elections",
        "name": "Intergroup Elections",
        "description": ("Election page: date and Zoom details, the positions up for "
                        "election, the election procedure as numbered steps, and a "
                        "card for each position's duties, term and vote."),
        "blocks": [header, overview, how, positions],
    }
