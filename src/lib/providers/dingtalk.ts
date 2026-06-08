import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { customFetch } from "@auth/core";

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
  const dingtalkCustomFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const isTokenRequest =
      url.includes("api.dingtalk.com/v1.0/oauth2/userAccessToken");

    if (isTokenRequest && init?.body) {
      let bodyStr: string;

      if (typeof init.body === "string") {
        bodyStr = init.body;
      } else if (init.body instanceof URLSearchParams) {
        bodyStr = init.body.toString();
      } else if (init.body instanceof ArrayBuffer || init.body instanceof Uint8Array) {
        bodyStr = new TextDecoder().decode(init.body);
      } else if (
        typeof init.body === "object" &&
        "getReader" in init.body
      ) {
        const reader = (init.body as ReadableStream).getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const totalLength = chunks.reduce(
          (acc, chunk) => acc + chunk.length,
          0,
        );
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        bodyStr = new TextDecoder().decode(merged);
      } else {
        bodyStr = String(init.body);
      }

      const params = new URLSearchParams(bodyStr);
      const code = params.get("code") ?? "";
      const clientId = params.get("client_id") ?? options.clientId;
      const clientSecret =
        params.get("client_secret") ?? options.clientSecret;

      if (!code) {
        throw new Error("钉钉 OAuth code 缺失");
      }

      const dingtalkBody = JSON.stringify({
        clientId,
        clientSecret,
        code,
        grantType: "authorization_code",
      });

      const newHeaders = new Headers(init.headers);
      newHeaders.set("Content-Type", "application/json");

      return fetch(input, {
        ...init,
        headers: newHeaders,
        body: dingtalkBody,
      });
    }

    return fetch(input, init);
  };

  return {
    id: "dingtalk",
    name: "钉钉",
    type: "oauth",
    /** 允许通过邮箱匹配自动关联已有账号（若无 Account 记录），钉钉为企业级认证，邮箱可信 */
    allowDangerousEmailAccountLinking: true,
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
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    token: {
      url: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
      conform: async (response: Response) => {
        const data = await response.json();
        if (data.code || data.message) {
          throw new Error(
            `钉钉 token 错误: [${data.code}] ${data.message}`,
          );
        }
        if (!data.accessToken || typeof data.accessToken !== "string") {
          throw new Error(
            `钉钉 token 响应缺少 accessToken: ${JSON.stringify(data)}`,
          );
        }
        return Response.json({
          access_token: data.accessToken,
          refresh_token: data.refreshToken ?? "",
          expires_in: data.expireIn ?? 7200,
          token_type: data.tokenType ?? "Bearer",
        });
      },
    },
    userinfo: {
      url: "https://api.dingtalk.com/v1.0/contact/users/me",
      async request(context: { tokens: { access_token?: string } }) {
        const res = await fetch(
          "https://api.dingtalk.com/v1.0/contact/users/me",
          {
            headers: {
              "x-acs-dingtalk-access-token": context.tokens.access_token!,
            },
          },
        );
        return res.json();
      },
    },
    profile(profile) {
      return {
        id: profile.unionId,
        name: profile.nick ?? "钉钉用户",
        email:
          profile.email?.trim().toLowerCase() ||
          `${profile.unionId.toLowerCase()}@dingtalk.i2i.local`,
        image: profile.avatarUrl,
      };
    },
    [customFetch]: dingtalkCustomFetch,
    options: {
      ...options,
      [customFetch]: dingtalkCustomFetch as any,
    } as typeof options,
  };
}
