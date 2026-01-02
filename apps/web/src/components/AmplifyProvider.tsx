"use client";

import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import React from "react";

const oauthConfig = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    ? {
        domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
        scopes: ["email", "openid", "profile"],
        redirectSignIn: process.env.NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN || "http://localhost:3000/login",
        redirectSignOut: process.env.NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT || "http://localhost:3000/login",
        responseType: "code"
    }
    : undefined;

// Configure Amplify with env vars or defaults
Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID || "us-east-1_dummy",
            userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID || "dummy",
            loginWith: oauthConfig ? { oauth: oauthConfig } : undefined
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
