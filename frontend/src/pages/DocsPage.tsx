import { Card } from '../components/ui/Card';
import { Shield, Lock, Clock, Users, Code, Zap, BookOpen, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-white border-b border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="w-8 h-8 text-accent" />
            <span className="text-sm font-mono font-bold text-accent uppercase tracking-wider">
              Documentation
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 text-textPrimary">
            FlowGuard Protocol
          </h1>
          <p className="text-xl md:text-2xl text-textMuted font-light max-w-3xl">
            Everything you need to know about managing your treasury with on-chain covenants,
            multi-signature approvals, and automated unlock schedules.
          </p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 mb-16 relative z-20">
        <div className="grid md:grid-cols-3 gap-6">
          <a href="#getting-started" className="block group decoration-0">
            <Card hover padding="lg" className="h-full group-hover:border-accent transition-all duration-300">
              <Zap className="w-10 h-10 text-accent mb-4" />
              <h3 className="text-xl font-display font-bold mb-2 text-textPrimary">Quick Start</h3>
              <p className="text-textMuted font-mono text-sm">Get up and running in minutes</p>
            </Card>
          </a>
          <a href="#guides" className="block group decoration-0">
            <Card hover padding="lg" className="h-full group-hover:border-accent transition-all duration-300">
              <Users className="w-10 h-10 text-accent mb-4" />
              <h3 className="text-xl font-display font-bold mb-2 text-textPrimary">User Guides</h3>
              <p className="text-textMuted font-mono text-sm">Step-by-step tutorials</p>
            </Card>
          </a>
          <a href="#technical" className="block group decoration-0">
            <Card hover padding="lg" className="h-full group-hover:border-accent transition-all duration-300">
              <Code className="w-10 h-10 text-textMuted group-hover:text-accent transition-colors mb-4" />
              <h3 className="text-xl font-display font-bold mb-2 text-textPrimary">Technical Docs</h3>
              <p className="text-textMuted font-mono text-sm">Architecture and contracts</p>
            </Card>
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="space-y-16">

          {/* Getting Started */}
          <section id="getting-started" className="scroll-mt-24">
            <h2 className="text-3xl font-display font-bold mb-8 text-textPrimary border-b border-accent/20 pb-4 inline-block">
              Getting Started
            </h2>

            <Card padding="xl" className="mb-8">
              <h3 className="text-2xl font-display font-bold mb-4 text-textPrimary flex items-center gap-3">
                <Shield className="w-7 h-7 text-accent" />
                What is FlowGuard?
              </h3>
              <p className="text-textMuted mb-8 text-lg leading-relaxed max-w-4xl">
                FlowGuard is an on-chain treasury management system built on Bitcoin Cash.
                It enables organizations to manage treasuries with scheduled budget releases,
                team-based approval workflows, and spending limits — all enforced by on-chain covenants
                without relying on centralized backends or third-party custodians.
              </p>

              <div className="bg-whiteAlt/50 rounded-xl p-8 border border-border">
                <h4 className="font-display font-bold text-lg mb-6 text-textPrimary">Key Features</h4>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-bold text-textPrimary mb-1">Recurring Unlock Schedules</div>
                      <div className="text-sm font-mono text-textMuted">Automated budget releases using Loop covenants</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-bold text-textPrimary mb-1">Multi-Signature Approval</div>
                      <div className="text-sm font-mono text-textMuted">Configurable M-of-N signer thresholds</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-bold text-textPrimary mb-1">Spending Guardrails</div>
                      <div className="text-sm font-mono text-textMuted">On-chain limits prevent treasury misuse</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Lock className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-bold text-textPrimary mb-1">Non-Custodial</div>
                      <div className="text-sm font-mono text-textMuted">You maintain full control of keys</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card padding="xl">
              <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary">Prerequisites</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-lg text-textPrimary mb-2">BCH Wallet</div>
                    <div className="text-textMuted">
                      Install the Paytaca wallet extension. FlowGuard supports any wallet that
                      implements the <code className="px-2 py-0.5 bg-surfaceAlt rounded text-sm font-mono text-textPrimary">window.bitcoincash</code> or <code className="px-2 py-0.5 bg-surfaceAlt rounded text-sm font-mono text-textPrimary">window.paytaca</code> API.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-lg text-textPrimary mb-2">Chipnet BCH</div>
                    <div className="text-textMuted">
                      Get testnet BCH from the <a href="https://tbch.googol.cash/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-bold">Chipnet Faucet</a>.
                      You'll need BCH for vault creation and transaction fees.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-lg text-textPrimary mb-2">Team Coordination</div>
                    <div className="text-textMuted">
                      Gather BCH addresses from all proposed signers. Each signer needs their own wallet.
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* User Guides */}
          <section id="guides" className="scroll-mt-24">
            <h2 className="text-3xl font-display font-bold mb-8 text-textPrimary border-b border-accent/20 pb-4 inline-block">
              User Guides
            </h2>

            <div className="space-y-8">
              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-accent" />
                  Creating Your First Vault
                </h3>
                <ol className="space-y-8">
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Connect Your Wallet</div>
                      <p className="text-textMuted">
                        Click "Connect Wallet" in the header and select your BCH wallet extension.
                        Approve the connection when prompted.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Navigate to Create Vault</div>
                      <p className="text-textMuted">
                        From the dashboard, click "Create Vault" or navigate to <code className="px-2 py-0.5 bg-surfaceAlt rounded text-sm font-mono text-textPrimary">/vaults/create</code>
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Enter Basic Information</div>
                      <p className="text-textMuted mb-4">
                        Provide a descriptive name and purpose for your vault:
                      </p>
                      <div className="bg-whiteAlt/50 rounded-lg p-5 border border-border font-mono text-sm">
                        <div className="text-textMuted">
                          <strong className="text-textPrimary">Name:</strong> "Q1 2025 Development Budget"<br />
                          <strong className="text-textPrimary">Description:</strong> "Monthly development stipends for core contributors"
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Configure Deposit & Schedule</div>
                      <p className="text-textMuted mb-4">
                        Set initial deposit amount and recurring unlock schedule:
                      </p>
                      <div className="bg-whiteAlt/50 rounded-lg p-5 border border-border text-sm font-mono">
                        <div className="text-textMuted space-y-2">
                          <div><strong className="text-textPrimary">Deposit:</strong> 10 BCH</div>
                          <div><strong className="text-textPrimary">Unlock Frequency:</strong> Monthly (every 30 days)</div>
                          <div><strong className="text-textPrimary">Amount per Unlock:</strong> 2 BCH</div>
                          <div><strong className="text-textPrimary">Total Cycles:</strong> 5 months</div>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Add Signers</div>
                      <p className="text-textMuted mb-4">
                        Add BCH addresses of authorized signers and set approval threshold:
                      </p>
                      <div className="bg-whiteAlt/50 rounded-lg p-5 border border-border text-sm font-mono">
                        <div className="text-textMuted space-y-2">
                          <div><strong className="text-textPrimary">Signers:</strong> 3 addresses</div>
                          <div><strong className="text-textPrimary">Threshold:</strong> 2-of-3 (any 2 signers must approve)</div>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      6
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Set Spending Caps (Optional)</div>
                      <p className="text-textMuted">
                        Add optional spending limits per proposal or per period to prevent misuse.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-6">
                    <div className="flex-shrink-0 w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white font-mono font-bold">
                      7
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg mb-2 text-textPrimary">Review and Confirm</div>
                      <p className="text-textMuted">
                        Review all parameters, then sign the transaction with your wallet. The vault
                        will be created on-chain and funds locked in the covenant.
                      </p>
                    </div>
                  </li>
                </ol>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-accent" />
                  Creating and Approving Proposals
                </h3>

                <div className="mb-8">
                  <h4 className="font-bold text-lg mb-3 text-textPrimary">What are Proposals?</h4>
                  <p className="text-textMuted leading-relaxed">
                    Proposals are spending requests that withdraw funds from an unlocked vault balance.
                    Each proposal requires approval from the configured number of signers (e.g., 2-of-3)
                    before it can be executed.
                  </p>
                </div>

                <div className="mb-8">
                  <h4 className="font-bold text-lg mb-4 text-textPrimary">Creating a Proposal</h4>
                  <ol className="space-y-4">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-accent">1.</span>
                      <div>
                        <span className="font-semibold text-textPrimary">Navigate to vault details</span>
                        <span className="text-textMuted"> and click "Create Proposal"</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-accent">2.</span>
                      <div>
                        <span className="font-semibold text-textPrimary">Enter recipient BCH address</span>
                        <span className="text-textMuted"> (must be valid cashaddr format)</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-accent">3.</span>
                      <div>
                        <span className="font-semibold text-textPrimary">Specify amount in BCH</span>
                        <span className="text-textMuted"> (cannot exceed unlocked balance)</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-accent">4.</span>
                      <div>
                        <span className="font-semibold text-textPrimary">Add description/reason</span>
                        <span className="text-textMuted"> for the spending request</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-accent">5.</span>
                      <div>
                        <span className="font-semibold text-textPrimary">Submit and sign</span>
                        <span className="text-textMuted"> the proposal transaction</span>
                      </div>
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-lg mb-4 text-textPrimary">Approving a Proposal</h4>
                  <p className="text-textMuted mb-4 leading-relaxed">
                    Signers can review pending proposals on the vault details page. To approve:
                  </p>
                  <ol className="space-y-4">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-textMuted">1.</span>
                      <div className="text-textMuted">
                        Review proposal details (recipient, amount, reason)
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-textMuted">2.</span>
                      <div className="text-textMuted">
                        Click "Approve" if you agree with the spending request
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-textMuted">3.</span>
                      <div className="text-textMuted">
                        Sign the approval transaction with your wallet
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-mono font-bold text-textMuted">4.</span>
                      <div className="text-textMuted">
                        Once threshold is met (e.g., 2-of-3), proposal can be executed
                      </div>
                    </li>
                  </ol>
                </div>

                <div className="mt-8 bg-blue-50/50 border border-blue-100 rounded-lg p-6">
                  <div className="flex gap-4">
                    <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700 leading-relaxed">
                      <strong className="font-bold block mb-1">Important:</strong> Once a proposal reaches the required approval threshold,
                      any signer can execute it to broadcast the payout transaction on-chain. Execution
                      is immediate and irreversible.
                    </div>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-textMuted" />
                  Managing Your Vault
                </h3>
                <div className="space-y-8">
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Monitoring Balance</h4>
                    <p className="text-textMuted">
                      Track your vault's total balance, locked balance, and unlocked balance from the vault
                      details page. Locked funds automatically unlock according to your configured schedule.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Viewing History</h4>
                    <p className="text-textMuted">
                      See complete history of all proposals, approvals, and payouts. Every action is
                      recorded on-chain with timestamps and transaction IDs.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Adding Signers</h4>
                    <p className="text-textMuted">
                      To add new signers, create a proposal to update the vault configuration. This
                      requires approval from existing signers according to the current threshold.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Technical Documentation */}
          <section id="technical" className="scroll-mt-24">
            <h2 className="text-3xl font-display font-bold mb-8 text-textPrimary border-b border-accent/20 pb-4 inline-block">
              Technical Documentation
            </h2>

            <div className="space-y-8">
              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary">Architecture Overview</h3>
                <p className="text-textMuted mb-8 leading-relaxed">
                  FlowGuard is built as a full-stack application with on-chain Bitcoin Cash covenants
                  as the source of truth. The architecture consists of three main layers:
                </p>
                <div className="space-y-8">
                  <div className="border-l-4 border-accent pl-6">
                    <h4 className="font-display font-bold text-lg mb-2 text-textPrimary">On-Chain Layer (Contracts)</h4>
                    <p className="text-textMuted">
                      CashScript covenants deployed on BCH chipnet. These contracts enforce all treasury
                      rules, including unlock schedules, approval thresholds, and spending limits. The
                      contracts are non-custodial and immutable once deployed.
                    </p>
                  </div>
                  <div className="border-l-4 border-accent pl-6">
                    <h4 className="font-display font-bold text-lg mb-2 text-textPrimary">Backend API (Node.js + SQLite)</h4>
                    <p className="text-textMuted">
                      Optional indexing layer that monitors on-chain activity and provides query APIs.
                      The backend does not control funds or enforce rules — it only mirrors on-chain state
                      for faster UX.
                    </p>
                  </div>
                  <div className="border-l-4 border-gray-300 pl-6">
                    <h4 className="font-display font-bold text-lg mb-2 text-textPrimary">Frontend (React + TypeScript)</h4>
                    <p className="text-textMuted">
                      User interface for wallet connection, vault creation, proposal management, and
                      transaction signing. Communicates directly with user wallets via browser extensions.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary">BCH 2026 Upgrade Features</h3>
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-5 mb-8">
                  <p className="text-sm text-blue-800">
                    📅 <strong>Upgrade Schedule:</strong> These features activate on Chipnet November 15, 2025 and Mainnet May 15, 2026.
                    FlowGuard currently runs a basic multisig on chipnet, with advanced contracts ready to deploy on activation.
                  </p>
                </div>
                <p className="text-textMuted mb-8 leading-relaxed">
                  FlowGuard uses features from the BCH 2026 upgrade:
                </p>
                <div className="space-y-8">
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-textPrimary">Loops (CHIP-2024-05)</h4>
                    </div>
                    <p className="text-textMuted pl-[56px]">
                      Enables recurring covenant execution. Vaults use Loops to automatically unlock
                      budget tranches on a fixed schedule (e.g., monthly releases). Each loop iteration
                      updates the on-chain state and makes more funds available for spending.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                        <Shield className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-textPrimary">P2S (Pay-to-Script)</h4>
                    </div>
                    <p className="text-textMuted pl-[56px]">
                      Allows direct covenant outputs without P2SH wrapping. Reduces transaction size
                      and makes covenant logic more transparent. All FlowGuard vaults use P2S for
                      efficient on-chain enforcement.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 bg-gray-400 rounded-lg flex items-center justify-center">
                        <Code className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-textPrimary">Bitwise Operations</h4>
                    </div>
                    <p className="text-textMuted pl-[56px]">
                      New opcodes for efficient bit manipulation. FlowGuard uses bitwise ops to encode
                      vault state (approval flags, unlock counters) compactly, minimizing on-chain data.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                        <Zap className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-textPrimary">Functions</h4>
                    </div>
                    <p className="text-textMuted pl-[56px]">
                      Reusable contract functions for modular logic. Permission checks, signature
                      verification, and spending limits are implemented as functions to reduce code
                      duplication and improve auditability.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary">Security Model</h3>
                <div className="space-y-8">
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Non-Custodial Design</h4>
                    <p className="text-textMuted leading-relaxed">
                      FlowGuard never takes custody of your funds. All BCH is locked in on-chain covenants
                      that only you and your signers can unlock. The FlowGuard team cannot access, freeze,
                      or modify your treasury.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Multi-Signature Approval</h4>
                    <p className="text-textMuted leading-relaxed">
                      Proposals require M-of-N signer approvals. This prevents any single signer from
                      unilaterally draining the treasury. Even if one signer's key is compromised,
                      funds remain safe.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">On-Chain Enforcement</h4>
                    <p className="text-textMuted leading-relaxed">
                      All rules (unlock schedules, spending caps, approval thresholds) are enforced by
                      covenant scripts. No backend service can override these rules — they are
                      mathematically guaranteed by Bitcoin Cash consensus.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-2 text-textPrimary">Open Source</h4>
                    <p className="text-textMuted leading-relaxed">
                      All contract code is open source and auditable. You can verify exactly what logic
                      controls your treasury by reading the CashScript source code.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-display font-bold mb-6 text-textPrimary">API Reference</h3>
                <div className="space-y-8">
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">GET /api/vaults</h4>
                    <p className="text-textMuted mb-3">Retrieve list of vaults, optionally filtered by creator address.</p>
                    <div className="bg-black text-gray-300 rounded-lg p-4 text-sm overflow-x-auto font-mono border border-gray-800">
                      <code>curl https://flowguard-production.up.railway.app/api/vaults?creator=bitcoincash:...</code>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-border">
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">GET /api/vaults/:id</h4>
                    <p className="text-textMuted">Get detailed information about a specific vault including balance and signers.</p>
                  </div>
                  <div className="pt-6 border-t border-border">
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">POST /api/vaults</h4>
                    <p className="text-textMuted">Create a new vault (requires wallet signature).</p>
                  </div>
                  <div className="pt-6 border-t border-border">
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">GET /api/vaults/:id/proposals</h4>
                    <p className="text-textMuted">List all proposals for a vault.</p>
                  </div>
                  <div className="pt-6 border-t border-border">
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">POST /api/vaults/:id/proposals</h4>
                    <p className="text-textMuted">Create a spending proposal (requires signer signature).</p>
                  </div>
                  <div className="pt-6 border-t border-border">
                    <h4 className="font-mono text-sm font-bold mb-2 text-accent uppercase">POST /api/proposals/:id/approve</h4>
                    <p className="text-textMuted">Approve a proposal (requires signer signature).</p>
                  </div>
                </div>
              </Card>

              <Card padding="xl" className="bg-amber-50/50 border border-amber-100">
                <div className="flex gap-5">
                  <AlertTriangle className="w-8 h-8 text-amber-500 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-2 text-amber-900 font-display">
                      Testnet Notice
                    </h3>
                    <p className="text-amber-800 leading-relaxed text-sm">
                      FlowGuard is currently deployed on Bitcoin Cash chipnet (testnet). Do not use
                      real funds. The contracts have not been formally audited. Use at your own risk.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* FAQs */}
          <section>
            <h2 className="text-3xl font-display font-bold mb-8 text-textPrimary border-b border-accent/20 pb-4 inline-block">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-textPrimary">
                  Can I change signers after creating a vault?
                </h3>
                <p className="text-textMuted">
                  Not in the current version. Signers are set at vault creation and cannot be modified.
                  To change signers, you would need to create a new vault and migrate funds.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-textPrimary">
                  What happens if I lose access to my wallet?
                </h3>
                <p className="text-textMuted">
                  If you're one of multiple signers, the remaining signers can still approve proposals
                  as long as the threshold is met. If you're the only signer or threshold can't be met,
                  funds remain locked. Always maintain secure backups of your wallet seed phrase.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-textPrimary">
                  How much do transactions cost?
                </h3>
                <p className="text-textMuted">
                  BCH transaction fees are typically less than $0.01 USD. Each vault creation, proposal,
                  and approval requires a small fee paid to miners.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-textPrimary">
                  Is my data private?
                </h3>
                <p className="text-textMuted">
                  All vault data is stored on the public Bitcoin Cash blockchain. Anyone can view vault
                  balances, proposals, and transaction history by inspecting on-chain data. FlowGuard
                  does not provide privacy features — use it for transparent treasuries only.
                </p>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

