# Serves the cached brand icon for an account/institution domain (see
# InstitutionIcon). Accounts reference it through Account#logo_url, so the
# browser only ever talks to this app — no third-party CDN call per page load.
#
# The URL carries a signature instead of relying on the session cookie: the
# mobile web app authenticates its API calls with a bearer token, and an <img>
# tag cannot send one, so a session-only route answered every icon request from
# the app with a redirect to the login page.
class InstitutionIconsController < ApplicationController
  skip_authentication only: :show

  def show
    domain = InstitutionIcon.verified_domain(params[:sig])
    return head :not_found if domain.blank? || domain != params[:institution].to_s

    # A domain the sources cannot illustrate still gets a neutral lettermark, so
    # the account list renders an icon in every case (no broken images).
    icon = InstitutionIcon.for(domain) || InstitutionIcon.lettermark(domain)

    response.headers["Cache-Control"] = "private, max-age=604800"
    send_data icon.body, type: icon.content_type, disposition: "inline"
  end
end
