require "test_helper"

# A trade row reads its amount as the cash that moved. Shares that arrived
# without cash (an RSU/ESPP vest, a transfer in) must not read as a $0.00
# outflow on the activity list.
class TradesTradeRowTest < ActionView::TestCase
  test "a cashless acquisition reads as quantity x price, not as zero" do
    entry = entries(:trade)
    entry.trade.update!(qty: 145, price: 324.57)
    entry.update!(amount: 0)

    render partial: "trades/trade", locals: { entry: entry }

    assert_includes rendered, "145 × $324.57"
    refute_includes rendered, "$0.00"
  end

  test "an ordinary buy still reads as its cash amount" do
    entry = entries(:trade)
    entry.trade.update!(qty: 10, price: 100)
    entry.update!(amount: 1000)

    render partial: "trades/trade", locals: { entry: entry }

    assert_includes rendered, "$1,000.00"
    refute_includes rendered, "no cash"
  end
end
