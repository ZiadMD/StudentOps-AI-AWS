"""
Unit tests for Google Meet Participant Identity Matcher.
"""
from app.services.identity_matcher import IdentityMatcher


STUDENTS = [
    {"id": "std_1", "full_name": "Ziad Mohamed Gamal", "arabic_name": "زياد محمد", "email": "ziad.member@studentops.org"},
    {"id": "std_2", "full_name": "Ali Hassan Mahmoud", "arabic_name": "علي حسن", "email": "ali.member@studentops.org"},
    {"id": "std_3", "full_name": "Salma Ahmed", "arabic_name": "سلمى أحمد", "email": "salma.member@studentops.org"}
]


def test_exact_email_match():
    match = IdentityMatcher.match_participant(
        display_name="Unknown Display Name",
        email="ali.member@studentops.org",
        students=STUDENTS
    )
    assert match.student_id == "std_2"
    assert match.matched_by == "EXACT_EMAIL"
    assert match.confidence == 1.0


def test_arabic_name_match():
    match = IdentityMatcher.match_participant(
        display_name="زياد محمد",
        email=None,
        students=STUDENTS
    )
    assert match.student_id == "std_1"
    assert match.matched_by == "ARABIC_NAME"
    assert match.confidence >= 0.90


def test_latin_name_match():
    match = IdentityMatcher.match_participant(
        display_name="Salma Ahmed",
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


def test_false_substring_match_prevented():
    """
    Ensure that a name containing a short substring of another student (e.g. 'Khalid' containing 'ali')
    is NOT incorrectly matched to that student.
    """
    match = IdentityMatcher.match_participant(
        display_name="Khalid",
        email=None,
        students=STUDENTS
    )
    assert match.student_id is None
    assert match.matched_by == "NONE"
    assert match.confidence == 0.0

