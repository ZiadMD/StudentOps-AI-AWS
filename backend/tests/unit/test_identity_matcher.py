"""
Unit tests for Google Meet Participant Identity Matcher.
"""
from app.services.identity_matcher import IdentityMatcher


STUDENTS = [
    {"id": "std_1", "full_name": "Maurine Magdy Adly", "arabic_name": "مورين مجدي عدلي", "email": "maurine.magdy@studentops.org"},
    {"id": "std_2", "full_name": "Alaa Mohamed Hassan", "arabic_name": "الاء محمد حسن", "email": "alaa.mohamed@studentops.org"},
    {"id": "std_3", "full_name": "Hanan Ahmed Ramadan", "arabic_name": "حنان احمد رمضان", "email": "hanan.ahmed@studentops.org"}
]


def test_exact_email_match():
    match = IdentityMatcher.match_participant(
        display_name="Unknown Display Name",
        email="alaa.mohamed@studentops.org",
        students=STUDENTS
    )
    assert match.student_id == "std_2"
    assert match.matched_by == "EXACT_EMAIL"
    assert match.confidence == 1.0


def test_arabic_name_match():
    match = IdentityMatcher.match_participant(
        display_name="مورين مجدي",
        email=None,
        students=STUDENTS
    )
    assert match.student_id == "std_1"
    assert match.matched_by == "ARABIC_NAME"
    assert match.confidence >= 0.90


def test_latin_name_match():
    match = IdentityMatcher.match_participant(
        display_name="Hanan Ahmed",
        email="",
        students=STUDENTS
    )
    assert match.student_id == "std_3"
    assert match.matched_by == "LATIN_NAME"
    assert match.confidence >= 0.90


def test_unmatched_fallback():
    match = IdentityMatcher.match_participant(
        display_name="External Guest 123",
        email="guest@external.com",
        students=STUDENTS
    )
    assert match.student_id is None
    assert match.matched_by == "NONE"
    assert match.confidence == 0.0
