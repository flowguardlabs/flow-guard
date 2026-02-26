import React from 'react';
import { Settings, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DaoTreasuryPolicyPage: React.FC = () => {
    return (
        <div className="max-w-6xl mx-auto px-4 py-8 md:px-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2 flex items-center gap-3">
                    Treasury Policy
                    <span className="bg-[#00E676] text-white text-xs px-2 py-1 rounded-md uppercase tracking-wider font-bold">Beta</span>
                </h1>
                <p className="text-textSecondary">Configure spending limits, approval thresholds, and security parameters.</p>
            </div>

            <div className="bg-surfaceAlt border border-border rounded-2xl p-8 mb-8 text-center max-w-2xl mx-auto mt-12">
                <div className="w-16 h-16 bg-[#00E676]/10 text-[#00E676] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Settings className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-textPrimary mb-4">Coming Soon: Policy Automation</h2>
                <p className="text-textSecondary mb-8 leading-relaxed">
                    This feature is currently in Developer Beta. FlowGuard's organizational layer is actively being built. In the upcoming releases, you will use this dashboard to:
                </p>

                <ul className="text-left text-sm text-textSecondary space-y-3 mb-10 max-w-md mx-auto">
                    <li className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] shrink-0" />
                        Enforce treasury-wide spending constraints across multiple vaults.
                    </li>
                    <li className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] shrink-0" />
                        Require configurable multi-sig or timelocked approval thresholds.
                    </li>
                    <li className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] shrink-0" />
                        Whitelist specific recipient addresses strictly for treasury payments.
                    </li>
                </ul>

                <Link to="/vaults" className="inline-flex items-center justify-center bg-[#1a1a1a] text-white px-6 py-3 rounded-xl font-medium hover:bg-black transition-colors shadow-lg shadow-black/5">
                    Go To Vaults <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
            </div>
        </div>
    );
};
