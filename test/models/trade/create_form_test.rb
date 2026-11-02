require "test_helper"

# A trade's entry amount is the cash that moved. Quantity x price is right for
# an ordinary purchase, but shares can arrive without cash (an RSU/ESPP vest, a
# transfer in). Booking those at quantity x price debits cash the account never
# held, so the balance reads "market value - cost" instead of market value.
class Trade::CreateFormTest < ActiveSupport::TestCase
  setup do
    @account = accounts(:investment)
    @security = securities(:aapl)
  end

  test "an ordinary buy books cash equal to quantity times price plus fee" do
    entry = build_form(qty: 10, price: 100, fee: 5).create

    assert entry.persisted?, entry.errors.full_messages.inspect
    assert_equal BigDecimal("1005"), entry.amount
    assert_equal BigDecimal("10"), entry.trade.qty
    assert_equal BigDecimal("100"), entry.trade.price
    refute entry.trade.cashless_acquisition?
  end

  test "a blank cash impact keeps the quantity times price derivation" do
    entry = build_form(qty: 10, price: 100, fee: 0, cash_impact: "").create

    assert entry.persisted?, entry.errors.full_messages.inspect
    assert_equal BigDecimal("1000"), entry.amount
  end

  test "a cash impact of 0 records shares that arrived without cash" do
    entry = build_form(qty: 145, price: 324.57, fee: 0, cash_impact: 0).create

    assert entry.persisted?, entry.errors.full_messages.inspect
    assert_equal BigDecimal("0"), entry.amount
    # The quantity and price still carry what the position and its basis need.
    assert_equal BigDecimal("145"), entry.trade.qty
    assert_equal BigDecimal("324.57"), entry.trade.price
    assert entry.trade.cashless_acquisition?
  end

  test "a cash impact overrides the derivation on a sale too" do
    entry = build_form(qty: 10, price: 100, fee: 0, type: "sell", cash_impact: 0).create

    assert entry.persisted?, entry.errors.full_messages.inspect
    assert_equal BigDecimal("0"), entry.amount
    assert_equal BigDecimal("-10"), entry.trade.qty
  end

  private
    def build_form(qty:, price:, fee: 0, cash_impact: nil, type: "buy")
      Trade::CreateForm.new(
        account: @account,
        date: Date.current,
        qty: qty,
        price: price,
        fee: fee,
        cash_impact: cash_impact,
        currency: "USD",
        type: type,
        manual_ticker: @security.ticker
      )
    end
end
