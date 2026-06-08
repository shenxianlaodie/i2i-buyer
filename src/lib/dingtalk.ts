import { db } from "@/lib/db";

export type DingtalkProfile = {
  unionId: string;
  openId?: string;
  nick?: string;
  avatarUrl?: string;
  mobile?: string;
  email?: string;
};

export async function exchangeDingtalkToken(authCode: string) {
  const res = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: process.env.AUTH_DINGTALK_ID,
      clientSecret: process.env.AUTH_DINGTALK_SECRET,
      code: authCode,
      grantType: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`钉钉 token 交换失败: ${text}`);
  }
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken?: string;
    expireIn?: number;
  };
  return data;
}

export async function fetchDingtalkProfile(accessToken: string): Promise<DingtalkProfile> {
  const res = await fetch("https://api.dingtalk.com/v1.0/contact/users/me", {
    headers: { "x-acs-dingtalk-access-token": accessToken },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取钉钉用户信息失败: ${text}`);
  }
  const data = (await res.json()) as DingtalkProfile & { unionId?: string };
  if (!data.unionId) {
    throw new Error("钉钉用户缺少 unionId");
  }
  return data;
}

export async function findOrCreateDingtalkUser(profile: DingtalkProfile) {
  const providerAccountId = profile.unionId;
  const existing = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "dingtalk",
        providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existing) {
    if (existing.user.disabled) return null;
    await db.user.update({
      where: { id: existing.user.id },
      data: {
        name: profile.nick ?? existing.user.name,
        image: profile.avatarUrl ?? existing.user.image,
      },
    });
    return existing.user;
  }

  const email =
    profile.email?.trim().toLowerCase() ||
    `${providerAccountId.toLowerCase()}@dingtalk.i2i.local`;

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        name: profile.nick ?? "钉钉用户",
        image: profile.avatarUrl,
        role: "USER",
      },
    });
  } else if (user.disabled) {
    return null;
  }

  await db.account.create({
    data: {
      userId: user.id,
      type: "oauth",
      provider: "dingtalk",
      providerAccountId,
      access_token: profile.openId,
    },
  });

  return user;
}
