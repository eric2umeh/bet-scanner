"""
Phase 10E — slip price-check / assisted converter.

  POST /convert/slip
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.convert import SlipConvertRequest, SlipConvertResponse, ConvertedLegOut
from app.services.slip_convert import convert_slip

router = APIRouter(prefix="/convert", tags=["convert"])


@router.post(
    "/slip",
    response_model=SlipConvertResponse,
    summary="Price-check a pasted slip across SportyBet / Bet9ja",
)
def convert_slip_endpoint(
    body: SlipConvertRequest,
    db: Session = Depends(get_db),
) -> SlipConvertResponse:
    """
    Does **not** decode opaque SportyBet/Bet9ja booking codes.

    Paste a readable slip (teams + markets). We fuzzy-match upcoming fixtures
    and compare stored NG odds so you can place on the better book.
    """
    result = convert_slip(
        db,
        slip_text=body.slip_text,
        code_text=body.code_text,
        source_book=body.source_book,
        days_ahead=body.days_ahead,
    )
    return SlipConvertResponse(
        legs=[ConvertedLegOut(**leg) for leg in result["legs"]],
        matched_count=result["matched_count"],
        combined_sportybet=result["combined_sportybet"],
        combined_bet9ja=result["combined_bet9ja"],
        combined_best_mixed=result["combined_best_mixed"],
        place_summary=result["place_summary"],
        code_text=result["code_text"],
        message=result["message"],
    )
