import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../hooks/useWallet';
import { createVault } from '../utils/api';

export default function CreateVaultPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    depositAmount: '',
    spendingCap: '',
    approvalThreshold: '2',
    signers: ['', '', ''],
    signerPubkeys: ['', '', ''], // NEW: Public keys for blockchain deployment
    cycleDuration: '2592000', // 30 days in seconds
    unlockAmount: '',
    isPublic: false, // Default to private
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignerChange = (index: number, value: string) => {
    const newSigners = [...formData.signers];
    newSigners[index] = value;
    setFormData(prev => ({ ...prev, signers: newSigners }));
  };

  const handlePubkeyChange = (index: number, value: string) => {
    const newPubkeys = [...formData.signerPubkeys];
    newPubkeys[index] = value;
    setFormData(prev => ({ ...prev, signerPubkeys: newPubkeys }));
  };

  // Auto-fill creator's address and public key in first signer slot
  const fillCreatorInfo = () => {
    if (wallet.address && wallet.publicKey) {
      const newSigners = [...formData.signers];
      const newPubkeys = [...formData.signerPubkeys];
      newSigners[0] = wallet.address;
      newPubkeys[0] = wallet.publicKey;
      setFormData(prev => ({
        ...prev,
        signers: newSigners,
        signerPubkeys: newPubkeys
      }));
    }
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!wallet.address) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Filter out empty signers and public keys
      const validSigners = formData.signers.filter(s => s.trim() !== '');
      const validPubkeys = formData.signerPubkeys.filter(pk => pk.trim() !== '');

      // Prepare vault data
      const vaultData = {
        totalDeposit: parseFloat(formData.depositAmount),
        spendingCap: formData.spendingCap ? parseFloat(formData.spendingCap) : 0,
        approvalThreshold: parseInt(formData.approvalThreshold),
        signers: validSigners,
        signerPubkeys: validPubkeys, // NEW: Include public keys for blockchain deployment
        cycleDuration: parseInt(formData.cycleDuration),
        unlockAmount: parseFloat(formData.unlockAmount),
        isPublic: formData.isPublic,
      };

      // Validate data
      if (vaultData.totalDeposit <= 0) {
        throw new Error('Deposit amount must be greater than 0');
      }
      if (vaultData.unlockAmount <= 0) {
        throw new Error('Unlock amount must be greater than 0');
      }
      if (validSigners.length !== 3) {
        throw new Error('Exactly 3 signers are required for blockchain deployment');
      }
      if (validPubkeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys are required for blockchain deployment');
      }
      if (validSigners.length < vaultData.approvalThreshold) {
        throw new Error('Number of signers must be at least the approval threshold');
      }

      // Create vault via API
      const newVault = await createVault(vaultData, wallet.address);

      // TODO: Sign transaction with wallet to deposit funds to vault
      // This would involve calling wallet.signTransaction with the vault contract

      // Navigate to vault detail page
      navigate(`/vaults/${newVault.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create vault');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="section-spacious">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/vaults" className="text-[--color-primary] hover:underline">
            ← Back to Vaults
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-8 section-bold">Create Vault</h1>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    s <= step ? 'bg-[--color-primary] text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s}
                </div>
                {s < 6 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      s < step ? 'bg-[--color-primary]' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card padding="lg">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Basic Information</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Vault Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="e.g., DAO Treasury"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  rows={4}
                  placeholder="Describe the purpose of this vault..."
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => handleInputChange('isPublic', e.target.checked)}
                    className="w-5 h-5 text-green-500 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <div>
                    <span className="block text-sm font-medium">Make vault public</span>
                    <span className="block text-xs text-gray-600 mt-1">
                      Public vaults can be viewed by anyone, but only signers can create proposals and approve them.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Deposit Amount */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Deposit Amount</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Total Deposit (BCH)</label>
                <input
                  type="number"
                  value={formData.depositAmount}
                  onChange={(e) => handleInputChange('depositAmount', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  step="0.01"
                />
                <p className="mt-2 text-sm text-gray-600">
                  This is the total amount of BCH you'll deposit into the vault.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Unlock Schedule */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Unlock Schedule</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Cycle Duration (seconds)</label>
                <select
                  value={formData.cycleDuration}
                  onChange={(e) => handleInputChange('cycleDuration', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                >
                  <option value="604800">Weekly (7 days)</option>
                  <option value="2592000">Monthly (30 days)</option>
                  <option value="7776000">Quarterly (90 days)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Unlock Amount per Cycle (BCH)</label>
                <input
                  type="number"
                  value={formData.unlockAmount}
                  onChange={(e) => handleInputChange('unlockAmount', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
          )}

          {/* Step 4: Signers and Threshold */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Signers and Approval Threshold</h2>

              {/* Warning about blockchain deployment */}
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ <strong>Blockchain Deployment Required:</strong> This vault will be deployed as a smart contract on Bitcoin Cash chipnet.
                  You must provide exactly 3 signer addresses with their public keys.
                </p>
              </div>

              {/* Auto-fill button */}
              {wallet.address && wallet.publicKey && (
                <Button
                  variant="outline"
                  onClick={fillCreatorInfo}
                  type="button"
                  className="mb-4"
                >
                  Auto-fill my wallet as Signer 1
                </Button>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Approval Threshold</label>
                <input
                  type="number"
                  value={formData.approvalThreshold}
                  onChange={(e) => handleInputChange('approvalThreshold', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  min="1"
                  max="3"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Number of signers required to approve a proposal (e.g., 2-of-3)
                </p>
              </div>

              <div className="space-y-6">
                <label className="block text-sm font-medium">Signers (exactly 3 required)</label>
                {formData.signers.map((signer, index) => (
                  <div key={index} className="space-y-2 p-4 border border-gray-200 rounded-lg">
                    <div className="font-medium text-sm text-gray-700 dark:text-gray-300">
                      Signer {index + 1}
                    </div>
                    <input
                      type="text"
                      value={signer}
                      onChange={(e) => handleSignerChange(index, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                      placeholder={`Signer ${index + 1} BCH address (bitcoincash:...)`}
                    />
                    <input
                      type="text"
                      value={formData.signerPubkeys[index]}
                      onChange={(e) => handlePubkeyChange(index, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary font-mono text-sm"
                      placeholder={`Signer ${index + 1} public key (hex format)`}
                    />
                    {formData.signerPubkeys[index] && (
                      <p className="text-xs text-green-600">
                        ✓ Public key provided ({formData.signerPubkeys[index].length} chars)
                      </p>
                    )}
                  </div>
                ))}
                <p className="text-sm text-gray-600">
                  <strong>Note:</strong> Public keys must be in hex format. Ask each signer to provide their public key from their BCH wallet.
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Spending Cap */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Spending Cap (Optional)</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Maximum Spending per Period (BCH)</label>
                <input
                  type="number"
                  value={formData.spendingCap}
                  onChange={(e) => handleInputChange('spendingCap', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="Leave empty for no cap"
                  step="0.01"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Optional: Set a maximum amount that can be spent per unlock period.
                </p>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Review and Confirm</h2>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-600">Vault Name:</span>
                  <p className="font-semibold">{formData.name || 'Not set'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Deposit Amount:</span>
                  <p className="font-semibold">{formData.depositAmount || '0'} BCH</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Unlock Schedule:</span>
                  <p className="font-semibold">
                    {formData.unlockAmount || '0'} BCH every{' '}
                    {formData.cycleDuration === '604800'
                      ? 'week'
                      : formData.cycleDuration === '2592000'
                      ? 'month'
                      : 'quarter'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Approval Threshold:</span>
                  <p className="font-semibold">
                    {formData.approvalThreshold}-of-{formData.signers.filter(s => s).length}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Signers:</span>
                  <div className="space-y-2 mt-2">
                    {formData.signers.filter(s => s).map((signer, index) => (
                      <div key={index} className="text-sm">
                        <p className="font-medium">Signer {index + 1}:</p>
                        <p className="font-mono text-xs text-gray-600 truncate">{signer}</p>
                        {formData.signerPubkeys[index] && (
                          <p className="font-mono text-xs text-green-600">
                            ✓ Public key: {formData.signerPubkeys[index].substring(0, 20)}...
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Spending Cap:</span>
                  <p className="font-semibold">
                    {formData.spendingCap || 'No cap'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Visibility:</span>
                  <p className="font-semibold">
                    {formData.isPublic ? 'Public' : 'Private'}
                  </p>
                </div>
              </div>

              {/* Blockchain deployment notice */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  🔗 <strong>Blockchain Deployment:</strong> Creating this vault will deploy a smart contract to Bitcoin Cash chipnet.
                  The contract will be deployed with the 3 signers and their public keys you've provided.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            {step > 1 ? (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                Back
              </Button>
            ) : (
              <div />
            )}
            {step < 6 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Creating Vault...' : 'Create Vault'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

