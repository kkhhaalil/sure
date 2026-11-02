require "net/http"

# Fetches an institution's icon from keyless public sources and caches the bytes
# server-side, so the app can show a real bank/brand mark without the visitor's
# browser talking to a third-party CDN on every page load (and without the
# Brandfetch client id that the upstream code path expects).
#
# The domain comes from Account#institution_domain, which InstitutionCatalog
# fills from the account name. Only fixed upstream hosts are contacted — the
# domain is a query parameter, never a destination — so this cannot be used to
# reach arbitrary hosts.
class InstitutionIcon
  Result = Data.define(:body, :content_type)

  # Both are keyless: Google's favicon service first (larger, full-colour PNG/JPEG
  # for most banks), DuckDuckGo's icon proxy as the fallback.
  SOURCES = [
    ->(domain) { "https://www.google.com/s2/favicons?domain=#{domain}&sz=128" },
    ->(domain) { "https://icons.duckduckgo.com/ip3/#{domain}.ico" }
  ].freeze

  # A 1x1 placeholder or a generic error page is worse than the lettermark the
  # view falls back to, so anything this small is treated as a miss.
  MIN_BYTES = 200
  OPEN_TIMEOUT = 3
  READ_TIMEOUT = 4
  MAX_REDIRECTS = 2
  CACHE_TTL = 30.days
  MISS_CACHE_TTL = 6.hours
  MISSING = :missing
  DOMAIN_PATTERN = /\A[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\z/

  class << self
    # Signed URL support. The mobile web app authenticates its API calls with a
    # bearer token, so an <img> it renders carries no session cookie and the
    # authenticated icon route answered with a redirect to the login page. The
    # signature is a capability: a URL we handed out for one institution loads
    # without a session, and anything unsigned or tampered with does not.
    SIGNATURE_PURPOSE = "institution_icon"

    def signature(domain)
      verifier.generate(domain.to_s.downcase)
    end

    def verified_domain(signature)
      return nil if signature.blank?

      verifier.verified(signature)
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      nil
    end

    def verifier
      Rails.application.message_verifier(SIGNATURE_PURPOSE)
    end

    # Returns a Result, or nil when no source produced a usable icon.
    def for(domain)
      domain = normalize(domain)
      return nil if domain.blank?

      cached = Rails.cache.read(cache_key(domain))
      return cached if cached.is_a?(Result)
      return nil if cached == MISSING

      result = fetch(domain)
      Rails.cache.write(cache_key(domain), result || MISSING, expires_in: result ? CACHE_TTL : MISS_CACHE_TTL)
      result
    end

    def normalize(domain)
      normalized = domain.to_s.strip.downcase.delete_prefix("www.")
      normalized.match?(DOMAIN_PATTERN) ? normalized : nil
    end

    # Stand-in for a domain with no usable favicon, so the account list never
    # renders a broken image: a neutral round lettermark in the same slot.
    def lettermark(domain)
      letter = domain.to_s.strip.upcase[0]
      letter = "?" if letter.blank? || !letter.match?(/\A[A-Z0-9]\z/)

      svg = <<~SVG
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
          <rect width="96" height="96" rx="48" fill="#e5e7eb"/>
          <text x="48" y="62" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="600" fill="#6b7280">#{letter}</text>
        </svg>
      SVG

      Result.new(body: svg, content_type: "image/svg+xml")
    end

    private
      def cache_key(domain)
        "institution_icon/v1/#{domain}"
      end

      def fetch(domain)
        SOURCES.each do |source|
          result = download(source.call(domain))
          return result if result && result.body.bytesize >= MIN_BYTES
        end
        nil
      end

      def download(url, redirects: MAX_REDIRECTS)
        uri = URI.parse(url)
        response = Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: uri.scheme == "https",
          open_timeout: OPEN_TIMEOUT,
          read_timeout: READ_TIMEOUT
        ) { |http| http.get(uri.request_uri) }

        if response.is_a?(Net::HTTPRedirection)
          location = response["location"].to_s
          return nil if location.blank? || redirects.zero?

          return download(URI.join(url, location).to_s, redirects: redirects - 1)
        end

        return nil unless response.is_a?(Net::HTTPSuccess)

        content_type = response["content-type"].to_s.split(";").first.to_s.strip
        return nil unless content_type.start_with?("image/")

        Result.new(body: response.body.to_s.b, content_type: content_type)
      rescue StandardError => e
        # Icon fetching is best-effort: the view falls back to a lettermark. Log
        # so a broken source is visible instead of silently degrading forever.
        Rails.logger.warn("[INSTITUTION_ICON] fetch failed url=#{url} #{e.class}: #{e.message}")
        nil
      end
  end
end
