namespace :accounts do
  desc "Persist the institution matched from account names (InstitutionCatalog)"
  task match_institutions: :environment do
    matched = 0

    Account.find_each do |account|
      # Skip accounts that already carry an institution, or whose provider
      # reports one: the reader uses those first anyway.
      next unless account.institution_unset?

      account.match_institution
      next if account.read_attribute(:institution_domain).blank?

      account.save!
      matched += 1
    end

    puts "accounts:match_institutions — #{matched} account(s) matched"
  end
end
