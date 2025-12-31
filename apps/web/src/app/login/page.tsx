"use client";

import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
    const router = useRouter();
    const { authStatus } = useAuthenticator(context => [context.authStatus]);

    useEffect(() => {
        if (authStatus === 'authenticated') {
            router.push('/onboarding');
        }
    }, [authStatus, router]);

    const handleMockLogin = () => {
        localStorage.setItem('menuvium_mock_user', 'true');
        router.push('/onboarding');
    };

    const isConfigured = process.env.NEXT_PUBLIC_USER_POOL_ID && process.env.NEXT_PUBLIC_USER_POOL_ID !== 'us-east-1_dummy';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-[#0a0a0a] text-white">
            <h1 className="text-3xl font-bold mb-8 tracking-tight">Login to Menuvium</h1>
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl">
                {isConfigured ? (
                    <div className="space-y-6">
                        <Authenticator />
                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <button
                                onClick={handleMockLogin}
                                className="w-full py-2 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg hover:bg-gray-200 transition-all"
                            >
                                [Dev] Enter with Mock Account
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-black space-y-6">
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900 leading-relaxed">
                            <p className="font-bold mb-1 italic">Development Mode</p>
                            <p>AWS Cognito is not yet configured for this environment. You can use the bypass below to test the onboarding flow locally.</p>
                        </div>
                        <button
                            onClick={handleMockLogin}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:opacity-90 transition-all active:scale-[0.98]"
                        >
                            Enter with Mock Account
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
