# Suggests categories for one transaction from the family's own history:
# what the same merchant (or, without a merchant, the same name) was
# categorized as before, then the family's most used categories to fill the
# remaining slots. Confidence is the share of matching history behind each.
class Transaction::CategorySuggester
  Suggestion = Data.define(:category, :confidence, :source)

  LOOKBACK = 1.year

  def initialize(transaction, limit: 3)
    @transaction = transaction
    @limit = limit
  end

  def suggestions
    picks = history_suggestions
    return picks if picks.size >= limit

    taken = picks.map { |pick| pick.category.id }
    picks + frequent_suggestions(excluding: taken).first(limit - picks.size)
  end

  private
    attr_reader :transaction, :limit

    def family
      transaction.entry.account.family
    end

    def history_suggestions
      scope, source = if transaction.merchant_id.present?
        [ categorized_history.where(merchant_id: transaction.merchant_id), "merchant_history" ]
      else
        [ categorized_history.where("lower(entries.name) = ?", transaction.entry.name.downcase), "name_history" ]
      end

      ranked(scope, source)
    end

    def frequent_suggestions(excluding:)
      ranked(categorized_history.where.not(category_id: excluding), "frequent")
    end

    def ranked(scope, source)
      counts = scope.group(:category_id).order(Arel.sql("COUNT(*) DESC")).limit(limit).count
      total = counts.values.sum
      return [] if total.zero?

      categories = family.categories.where(id: counts.keys).index_by(&:id)
      counts.filter_map do |category_id, count|
        category = categories[category_id]
        Suggestion.new(category:, confidence: (count.to_f / total).round(2), source:) if category
      end
    end

    def categorized_history
      family.transactions
        .joins(:entry)
        .where.not(id: transaction.id)
        .where.not(category_id: nil)
        .where(entries: { date: LOOKBACK.ago.to_date.. })
    end
end
