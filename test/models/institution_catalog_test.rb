require "test_helper"

class InstitutionCatalogTest < ActiveSupport::TestCase
  test "matches card product names to the issuer that issues them" do
    assert_equal "Chase", InstitutionCatalog.match("Sapphire Preferred (...4288)").name
    assert_equal "Chase", InstitutionCatalog.match("Freedom Flex (...6739)").name
    assert_equal "Alaska Airlines", InstitutionCatalog.match("Atmos Rewards Ascent Visa Signature").name
    assert_equal "Wells Fargo", InstitutionCatalog.match("EVERYDAY CHECKING ...0983").name
  end

  test "matches institutions named directly" do
    assert_equal "americanexpress.com", InstitutionCatalog.match("American Express Gold Card").domain
    assert_equal "robinhood.com", InstitutionCatalog.match("Robinhood Credit Card **2122").domain
  end

  test "uses the provider's institution name when the account name is generic" do
    assert_equal "chase.com", InstitutionCatalog.match("Personal (...7898)", "Chase").domain
  end

  test "leaves a name it cannot place alone" do
    assert_nil InstitutionCatalog.match("Checking")
    assert_nil InstitutionCatalog.match(nil, "")
  end
end
