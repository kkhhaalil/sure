# Serves the cached brand icon for an account/institution domain (see
# InstitutionIcon). Accounts reference it through Account#logo_url, so the
# browser only ever talks to this app — no third-party CDN call per page load.
class InstitutionIconsController < ApplicationController
  def show
    # A domain the sources cannot illustrate still gets a neutral lettermark, so
    # the account list renders an icon in every case (no broken images).
    icon = InstitutionIcon.for(params[:institution]) || InstitutionIcon.lettermark(params[:institution])

    response.headers["Cache-Control"] = "private, max-age=604800"
    send_data icon.body, type: icon.content_type, disposition: "inline"
  end
end
