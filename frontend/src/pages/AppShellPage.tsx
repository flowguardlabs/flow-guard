import React from 'react';
import { useAppMode } from '../hooks/useAppMode';
import { Rocket, Wallet, Users, Settings, ShieldCheck, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AppShellPage: React.FC = () => {
    const { mode } = useAppMode();

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 md:px-8">
            <div className="mb-10 text-center md:text-left">
                <h1 className="text-4xl font-extrabold text-[#1a1a1a] tracking-tight mb-3">
                    Welcome to FlowGuard
                </h1>
                <p className="text-lg text-textSecondary max-w-2xl">
                    {mode === 'user'
                        ? 'Access your personal vaults, streams, and operational tools below.'
                        : 'Manage organization-level treasury structures, team access, and governance.'}
                </p>
            </div>

            {mode === 'dao' && (
                <div className="bg-[#00E676]/10 border border-[#00E676]/30 rounded-xl p-6 mb-8 flex items-start sm:items-center gap-4">
                    <div className="bg-[#00E676] text-white px-3 py-1 rounded-md text-sm font-bold tracking-widest shrink-0">
                        BETA
                    </div>
                    <p className="text-[#1a1a1a] text-sm md:text-base">
                        <strong>DAO Mode is currently in Developer Beta.</strong> You can explore conceptual workflows for organization-level treasury policies, team roles, and overviews.
                        Backend role enforcement and on-chain mapping are coming in the next protocol upgrade.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {/* Quick Action: Vaults */}
                <Link to="/vaults" className="group flex flex-col items-start bg-surface border border-border rounded-2xl p-6 hover:shadow-xl hover:shadow-[#00E676]/5 hover:border-[#00E676]/30 transition-all cursor-pointer h-full">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl mb-4 group-hover:scale-110 transition-transform">
                        <Wallet className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-textPrimary mb-2 group-hover:text-[#00E676] transition-colors">Treasury Vaults</h3>
                    <p className="text-textSecondary text-sm mb-6 flex-grow">
                        Manage your on-chain Bitcoin Cash treasuries, view balances, and create programmatic spending proposals.
                    </p>
                    <div className="text-[#00E676] font-medium text-sm flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                        Open Vaults <ArrowRight className="w-4 h-4" />
                    </div>
                </Link>

                {/* Quick Action: Streams */}
                <Link to="/streams" className="group flex flex-col items-start bg-surface border border-border rounded-2xl p-6 hover:shadow-xl hover:shadow-[#00E676]/5 hover:border-[#00E676]/30 transition-all cursor-pointer h-full">
                    <div className="p-3 bg-[#00E676]/10 text-[#00E676] rounded-xl mb-4 group-hover:scale-110 transition-transform">
                        <Rocket className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-textPrimary mb-2 group-hover:text-[#00E676] transition-colors">Token Streams</h3>
                    <p className="text-textSecondary text-sm mb-6 flex-grow">
                        Set up and manage continuous, trust-minimized recurring token payments and vesting contracts.
                    </p>
                    <div className="text-[#00E676] font-medium text-sm flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                        Manage Streams <ArrowRight className="w-4 h-4" />
                    </div>
                </Link>

                {/* Quick Action: Payments */}
                <Link to="/payments" className="group flex flex-col items-start bg-surface border border-border rounded-2xl p-6 hover:shadow-xl hover:shadow-[#00E676]/5 hover:border-[#00E676]/30 transition-all cursor-pointer h-full">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl mb-4 group-hover:scale-110 transition-transform">
                        <ArrowRight className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-textPrimary mb-2 group-hover:text-[#00E676] transition-colors">Bulk Payments</h3>
                    <p className="text-textSecondary text-sm mb-6 flex-grow">
                        Execute batch transfers and airdrops efficiently to multiple recipients in a single covenant flow.
                    </p>
                    <div className="text-[#00E676] font-medium text-sm flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                        Send Payments <ArrowRight className="w-4 h-4" />
                    </div>
                </Link>
            </div>

            {mode === 'dao' && (
                <>
                    <h2 className="text-2xl font-bold text-[#1a1a1a] mb-6">Explore DAO Operations</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Link to="/app/dao/overview" className="bg-whiteAlt border border-border rounded-xl p-5 hover:bg-surface transition-colors flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg border border-border">
                                    <ShieldCheck className="w-5 h-5 text-textSecondary" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-textPrimary">DAO Overview</h4>
                                    <p className="text-xs text-textSecondary">High-level treasury health & status</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Link>

                        <Link to="/app/dao/team" className="bg-whiteAlt border border-border rounded-xl p-5 hover:bg-surface transition-colors flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg border border-border">
                                    <Users className="w-5 h-5 text-textSecondary" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-textPrimary">Team Directory</h4>
                                    <p className="text-xs text-textSecondary">Manage organizational members</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Link>

                        <Link to="/app/dao/roles" className="bg-whiteAlt border border-border rounded-xl p-5 hover:bg-surface transition-colors flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg border border-border">
                                    <ShieldCheck className="w-5 h-5 text-textSecondary" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-textPrimary">Role Management</h4>
                                    <p className="text-xs text-textSecondary">Configure permissions structure</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Link>

                        <Link to="/app/dao/treasury-policy" className="bg-whiteAlt border border-border rounded-xl p-5 hover:bg-surface transition-colors flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg border border-border">
                                    <Settings className="w-5 h-5 text-textSecondary" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-textPrimary">Treasury Policy</h4>
                                    <p className="text-xs text-textSecondary">Spending limits & approvals config</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
};
