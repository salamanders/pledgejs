import pytest
from playwright.sync_api import Page, expect

def test_homepage_loads(page: Page):
    """
    Verifies that the homepage loads, the spinner is present,
    and the Sign In button (via the auth flow) eventually appears.
    """
    # Note: We assume the app is running on localhost:8080.
    # Since we are running python -m http.server from the root, the file is at /website/index.html
    page.goto("http://127.0.0.1:8080/website/index.html")

    # Check URL
    expect(page).to_have_url("http://127.0.0.1:8080/website/index.html")

    # Spinner should be initially visible
    expect(page.locator("#spinner")).to_be_visible()

    # The auth.js logic creates a dialog with id 'google-signin-button' if no token exists.
    # We wait for it to appear.
    signin_dialog = page.locator("#google-signin-button")
    expect(signin_dialog).to_be_visible(timeout=10000)

    # Verify the button inside the dialog
    signin_button = signin_dialog.locator("button")
    expect(signin_button).to_contain_text("Sign In / Authorize")

def test_legacy_gapi_removed(page: Page):
    """
    Verifies that the legacy 'gapi' object is not loaded in the window.
    """
    page.goto("http://127.0.0.1:8080/website/index.html")

    # Evaluate javascript to check for window.gapi
    gapi_exists = page.evaluate("() => typeof window.gapi !== 'undefined'")

    # It should be False because we removed it.
    # NOTE: The GIS library loads 'google.accounts', not 'gapi'.
    assert gapi_exists is False, "Legacy 'gapi' object should not be present."
