"use client";

import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import React from "react";

// Configure Amplify with env vars or defaults
Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID || "us-east-1_dummy",
            userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID || "dummy",
        }
    }
});

export default function AmplifyProvider({ children }: { children: React.ReactNode }) {
    return (
        <Authenticator.Provider>
            {children}
        </Authenticator.Provider>
    );
}
