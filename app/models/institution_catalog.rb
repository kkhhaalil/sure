# Resolves the institution behind an account from text the account already
# carries (its name, and the institution name a provider gave it), so an account
# created by hand or imported from a statement still shows the bank's real name
# and icon instead of a lettermark.
#
# Matching is deliberately conservative. A wrong brand is worse than the
# generic fallback, so an entry only claims tokens that would not appear in an
# unrelated account name ("chase", "amex", "discover"), never bare words that
# double as ordinary English ("saving", "checking", "personal").
class InstitutionCatalog
  Entry = Data.define(:name, :domain, :patterns) do
    def match?(text)
      patterns.any? { |pattern| pattern.match?(text) }
    end
  end

  # Order matters: the first entry that matches wins, so product names that
  # identify one issuer's card (Freedom, Sapphire, Everyday Checking) are listed
  # before the issuer's own name and before anything generic.
  ENTRIES = [
    # --- Card products that do not carry the bank's name -------------------
    Entry.new(
      name: "Chase",
      domain: "chase.com",
      patterns: [ /\bchase\b/, /\bsapphire\b/, /\bfreedom flex\b/, /\bfreedom unlimited\b/, /\bink business\b/, /\bamazon visa\b/ ]
    ),
    Entry.new(
      name: "Wells Fargo",
      domain: "wellsfargo.com",
      patterns: [ /\bwells fargo\b/, /\beveryday checking\b/, /\bactive cash\b/, /\bautograph\b/ ]
    ),
    Entry.new(
      name: "Alaska Airlines",
      domain: "alaskaair.com",
      patterns: [ /\balaska airlines\b/, /\batmos rewards\b/ ]
    ),
    Entry.new(
      name: "Capital One",
      domain: "capitalone.com",
      patterns: [ /\bcapital one\b/, /\bventure x\b/, /\bsavor\b/, /\bquicksilver\b/ ]
    ),
    Entry.new(
      name: "Citi",
      domain: "citi.com",
      patterns: [ /\bciti\b/, /\bciti card\b/, /\bcostco anywhere\b/, /\bdouble cash\b/, /\bcustom cash\b/ ]
    ),
    Entry.new(
      name: "Apple Card",
      domain: "apple.com",
      patterns: [ /\bapple card\b/, /\bgoldman sachs\b/ ]
    ),
    Entry.new(
      name: "Bank of America",
      domain: "bankofamerica.com",
      patterns: [ /\bbank of america\b/, /\bbofa\b/, /\bmerrill\b/ ]
    ),

    # --- Institutions named as such ---------------------------------------
    Entry.new(
      name: "American Express",
      domain: "americanexpress.com",
      patterns: [ /\bamerican express\b/, /\bamex\b/ ]
    ),
    Entry.new(
      name: "Discover",
      domain: "discover.com",
      patterns: [ /\bdiscover\b/ ]
    ),
    Entry.new(
      name: "Robinhood",
      domain: "robinhood.com",
      patterns: [ /\brobinhood\b/ ]
    ),
    Entry.new(
      name: "SoFi",
      domain: "sofi.com",
      patterns: [ /\bsofi\b/, /\bsofi bank\b/ ]
    ),
    Entry.new(
      name: "U.S. Bank",
      domain: "usbank.com",
      patterns: [ /\bu\.?s\.? bank\b/, /\busbank\b/ ]
    ),
    Entry.new(
      name: "Navy Federal",
      domain: "navyfederal.org",
      patterns: [ /\bnavy federal\b/, /\bnfcu\b/ ]
    ),
    Entry.new(
      name: "PNC",
      domain: "pnc.com",
      patterns: [ /\bpnc bank\b/ ]
    ),
    Entry.new(
      name: "TD Bank",
      domain: "td.com",
      patterns: [ /\btd bank\b/ ]
    ),
    Entry.new(
      name: "BMO",
      domain: "bmo.com",
      patterns: [ /\bbmo\b/, /\bbank of montreal\b/ ]
    ),
    Entry.new(
      name: "RBC",
      domain: "rbc.com",
      patterns: [ /\brbc\b/, /\broyal bank\b/ ]
    ),
    Entry.new(
      name: "HSBC",
      domain: "hsbc.com",
      patterns: [ /\bhsbc\b/ ]
    ),
    Entry.new(
      name: "Barclays",
      domain: "barclays.com",
      patterns: [ /\bbarclays\b/ ]
    ),
    Entry.new(
      name: "Synchrony",
      domain: "synchrony.com",
      patterns: [ /\bsynchrony\b/ ]
    ),
    Entry.new(
      name: "Ally",
      domain: "ally.com",
      patterns: [ /\bally bank\b/ ]
    ),
    Entry.new(
      name: "Charles Schwab",
      domain: "schwab.com",
      patterns: [ /\bschwab\b/ ]
    ),
    Entry.new(
      name: "Fidelity",
      domain: "fidelity.com",
      patterns: [ /\bfidelity\b/ ]
    ),
    Entry.new(
      name: "Vanguard",
      domain: "vanguard.com",
      patterns: [ /\bvanguard\b/ ]
    ),
    Entry.new(
      name: "E*TRADE",
      domain: "etrade.com",
      patterns: [ /\be\*?trade\b/ ]
    ),
    Entry.new(
      name: "Betterment",
      domain: "betterment.com",
      patterns: [ /\bbetterment\b/ ]
    ),
    Entry.new(
      name: "Wealthfront",
      domain: "wealthfront.com",
      patterns: [ /\bwealthfront\b/ ]
    ),
    Entry.new(
      name: "Coinbase",
      domain: "coinbase.com",
      patterns: [ /\bcoinbase\b/ ]
    ),
    Entry.new(
      name: "Kraken",
      domain: "kraken.com",
      patterns: [ /\bkraken\b/ ]
    ),
    Entry.new(
      name: "Binance",
      domain: "binance.com",
      patterns: [ /\bbinance\b/ ]
    ),
    Entry.new(
      name: "Wise",
      domain: "wise.com",
      patterns: [ /\bwise\b/ ]
    ),
    Entry.new(
      name: "PayPal",
      domain: "paypal.com",
      patterns: [ /\bpaypal\b/ ]
    ),
    Entry.new(
      name: "Venmo",
      domain: "venmo.com",
      patterns: [ /\bvenmo\b/ ]
    ),
    Entry.new(
      name: "Cash App",
      domain: "cash.app",
      patterns: [ /\bcash app\b/, /\bsquare cash\b/ ]
    ),
    Entry.new(
      name: "Amazon",
      domain: "amazon.com",
      patterns: [ /\bamazon (visa|card|store card)\b/ ]
    ),
    Entry.new(
      name: "Target",
      domain: "target.com",
      patterns: [ /\btarget redcard\b/, /\btarget circle card\b/ ]
    )
  ].freeze

  class << self
    # Returns the Entry for the first catalog institution named by `texts`
    # (account name, institution name), or nil when nothing matches.
    def match(*texts)
      candidates = texts.compact_blank.map { |text| text.to_s.downcase }
      return nil if candidates.empty?

      ENTRIES.find { |entry| candidates.any? { |text| entry.match?(text) } }
    end
  end
end
