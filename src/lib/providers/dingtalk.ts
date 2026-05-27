import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

export type DingtalkOAuthProfile = {
  unionId: string;
  nick?: string;
  avatarUrl?: string;
  email?: string;
  mobile?: string;
};

export default function DingtalkProvider(
  options: OAuthUserConfig<DingtalkOAuthProfile>,
): OAuthConfig<DingtalkOAuthProfile> {
  return {
    id: "dingtalk",
    name: "钉钉",
    type: "oauth",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: "https://login.dingtalk.com/oauth2/auth",
      params: {
        scope: "openid",
        response_type: "code",
        prompt: "consent",
      },
    },
    token: {
      url: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
      async request(context: {
        params: { code?: string; authCode?: string };
        provider: { clientId?: string; clientSecret?: string };
      }) {
        const { params, provider } = context;
        const res = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: provider.clientId,
            clientSecret: provider.clientSecret,
            code: params.code ?? params.authCode,
            grantType: "authorization_code",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(JSON.stringify(data));
        }
        return {
          tokens: {
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
            expires_in: data.expireIn,
            token_type: "Bearer",
          },
        };
      },
    },
    userinfo: {
      url: "https://api.dingtalk.com/v1.0/contact/users/me",
      async request(context: { tokens: { access_token?: string } }) {
        const res = await fetch("https://api.dingtalk.com/v1.0/contact/users/me", {
          headers: {
            "x-acs-dingtalk-access-token": context.tokens.access_token!,
          },
        });
        return res.json();
      },
    },
    profile(profile) {
      return {
        id: profile.unionId,
        name: profile.nick ?? "钉钉用户",
        email:
          profile.email?.trim().toLowerCase() ||
          `${profile.unionId}@dingtalk.i2i.local`,
        image: profile.avatarUrl,
      };
    },
    options,
  };
}
