# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Rules', type: :request do
  let(:family) do
    Family.create!(
      name: 'API Family',
      currency: 'USD',
      locale: 'en',
      date_format: '%m-%d-%Y'
    )
  end

  let(:user) do
    family.users.create!(
      email: 'api-user@example.com',
      password: 'password123',
      password_confirmation: 'password123'
    )
  end

  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(
      user: user,
      name: 'API Docs Key',
      key: key,
      scopes: %w[read],
      source: 'web'
    )
  end

  let(:api_key_without_read_scope) do
    key = ApiKey.generate_secure_key
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to document the runtime insufficient-scope response.
    ApiKey.new(
      user: user,
      name: 'No Read Docs Key',
      key: key,
      scopes: [],
      display_key: key,
      source: 'mobile'
    ).tap { |api_key| api_key.save!(validate: false) }
  end

  let(:'X-Api-Key') { api_key.plain_key }

  let!(:rule) do
    family.rules.build(
      name: 'Coffee cleanup',
      resource_type: 'transaction',
      active: true,
      effective_date: Date.new(2024, 1, 1)
    ).tap do |rule|
      rule.conditions.build(condition_type: 'transaction_name', operator: 'like', value: 'coffee')
      rule.actions.build(action_type: 'set_transaction_name', value: 'Coffee')
      rule.save!
    end
  end

  path '/api/v1/rules' do
    get 'List rules' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :page, in: :query, type: :integer, required: false,
                description: 'Page number (default: 1)'
      parameter name: :per_page, in: :query, type: :integer, required: false,
                description: 'Items per page (default: 25, max: 100)'
      parameter name: :resource_type, in: :query, required: false,
                description: 'Filter by rule resource type',
                schema: { type: :string, enum: %w[transaction] }
      parameter name: :active, in: :query, required: false,
                description: 'Filter by active status',
                schema: { type: :boolean }

      response '200', 'rules listed' do
        schema '$ref' => '#/components/schemas/RuleCollection'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'forbidden - requires read scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '422', 'invalid active filter' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:active) { 'not_boolean' }

        run_test!
      end

      response '422', 'unsupported resource type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:resource_type) { 'account' }

        run_test!
      end
    end
  end

  path '/api/v1/rules/{id}' do
    parameter name: :id, in: :path, type: :string, required: true, description: 'Rule ID'

    get 'Retrieve a rule' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:id) { rule.id }

      response '200', 'rule retrieved' do
        schema '$ref' => '#/components/schemas/RuleResponse'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'forbidden - requires read scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '404', 'rule not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end
  end

  path '/api/v1/rules/preview' do
    post 'Preview the transactions a rule would match' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object,
        required: %w[rule],
        properties: {
          rule: {
            type: :object,
            required: %w[resource_type],
            properties: {
              resource_type: { type: :string, enum: %w[transaction] },
              effective_date: { type: :string, format: :date, nullable: true },
              conditions_attributes: {
                type: :array,
                items: {
                  type: :object,
                  properties: {
                    condition_type: { type: :string },
                    operator: { type: :string },
                    value: { type: :string }
                  }
                }
              }
            }
          }
        }
      }

      let(:body) do
        { rule: { resource_type: 'transaction', conditions_attributes: [ { condition_type: 'transaction_name', operator: 'like', value: 'coffee' } ] } }
      end

      response '200', 'matches previewed' do
        schema '$ref' => '#/components/schemas/RulePreviewResponse'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '422', 'unsupported resource type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { rule: { resource_type: 'account' } } }

        run_test!
      end
    end
  end

  path '/api/v1/rules/from_transaction' do
    post 'Create a categorization rule from a transaction' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Matches the transaction\'s merchant (or its name when it has none), sets the category, and applies the rule to existing matches in the background.'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object,
        required: %w[transaction_id category_id],
        properties: {
          transaction_id: { type: :string, format: :uuid },
          category_id: { type: :string, format: :uuid }
        }
      }

      let(:write_api_key) do
        key = ApiKey.generate_secure_key
        ApiKey.create!(user: user, name: 'API Docs Write Key', key: key, scopes: %w[read_write], source: 'mobile')
      end
      let(:'X-Api-Key') { write_api_key.plain_key }
      let(:account) do
        Account.create!(family: family, name: 'Checking', balance: 0, currency: 'USD', accountable: Depository.create!)
      end
      let(:category) { family.categories.create!(name: 'Coffee', color: '#6f4e37') }
      let(:transaction_record) do
        account.entries.create!(name: 'BLUE BOTTLE', amount: 6, currency: 'USD', date: Date.current, entryable: Transaction.new).entryable
      end
      let(:body) { { transaction_id: transaction_record.id, category_id: category.id } }

      response '201', 'rule created' do
        schema '$ref' => '#/components/schemas/RuleResponse'

        run_test!
      end

      response '404', 'transaction or category not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { transaction_id: SecureRandom.uuid, category_id: category.id } }

        run_test!
      end
    end
  end
end
