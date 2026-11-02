# frozen_string_literal: true

class AddReviewedAtToEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :entries, :reviewed_at, :datetime
    add_index :entries, [ :account_id, :reviewed_at ]
  end
end
