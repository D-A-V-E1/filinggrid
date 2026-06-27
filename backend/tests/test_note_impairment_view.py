"""Tests for note-impairment section matching and compare column view rules."""

from sec.section_extractor import _match_section


def test_risk_factor_impairment_prose_not_note_impairment():
    """AMD-style risk bullets must not register as the impairment footnote."""
    heading = "We may incur future impairments of our technology license purchases."
    assert _match_section(heading) != ("note-impairment", "Note — Impairment")


def test_impairment_of_long_lived_assets_heading_matches():
    match = _match_section("Impairment of Long-Lived Assets")
    assert match is not None
    assert match[0] == "note-impairment"


def test_asset_impairment_note_heading_matches():
    match = _match_section("Note 7 — Asset Impairment Charges")
    assert match is not None
    assert match[0] == "note-impairment"


def test_footnote_without_xbrl_should_offer_excerpt_not_edgar_only():
    """Document expected UI mode: indexed footnotes without XBRL get excerpt toggles."""

    def resolve(active_section, has_section, has_xbrl, is_statement=False):
        footnote = active_section.startswith("note-") if active_section else False
        narrative = active_section in {
            "business",
            "risk-factors",
            "unresolved-staff",
            "properties",
            "legal-proceedings",
            "mine-safety",
            "mda",
            "market-risk",
            "disagreements",
            "controls",
            "other-info",
        }
        xbrl_backed = (
            active_section == "financial-statements"
            or active_section
            in {"income_statement", "balance_sheet", "cash_flow", "stockholders_equity"}
            or footnote
        )
        xbrl_only = bool(active_section and xbrl_backed and has_xbrl)
        show_sec = bool(
            active_section
            and has_section
            and not is_statement
            and not footnote
            and not narrative
            and xbrl_backed
            and not has_xbrl
        )
        show_excerpt = bool(
            active_section
            and has_section
            and not is_statement
            and not show_sec
            and (
                xbrl_only
                or (footnote and xbrl_backed and not has_xbrl)
                or narrative
            )
        )
        return show_sec, show_excerpt, xbrl_only

    show_sec, show_excerpt, xbrl_only = resolve("note-impairment", True, False)
    assert show_sec is False
    assert show_excerpt is True
    assert xbrl_only is False

    show_sec, show_excerpt, xbrl_only = resolve("note-impairment", True, True)
    assert show_sec is False
    assert show_excerpt is True
    assert xbrl_only is True

    show_sec, show_excerpt, _ = resolve("mda", True, False)
    assert show_sec is False
    assert show_excerpt is True

    show_sec, show_excerpt, _ = resolve("business", True, False)
    assert show_sec is False
    assert show_excerpt is True

    show_sec, show_excerpt, _ = resolve("financial-statements", True, False)
    assert show_sec is True
    assert show_excerpt is False
