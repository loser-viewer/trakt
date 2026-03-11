WidgetMetadata = {
  id: "trakt_recommendations",
  title: "Trakt 推荐榜单",
  description: "获取 Trakt 个性化推荐电影 / 剧集列表",
  author: "hyl",
  site: "https://github.com/quantumultxx/ForwardWidgets",
  version: "1.0",
  requiredVersion: "0.0.1",
  detailCacheDuration: 1800,
  modules: [
    {
      title: "Trakt 电影推荐",
      description: "获取你的 Trakt 个性化电影推荐",
      requiresWebView: false,
      functionName: "fetchTraktMovieRecommendations",
      cacheDuration: 1800,
      params: [
        {
          name: "client_id",
          title: "Trakt Client ID",
          type: "input",
          value: ""
        },
        {
          name: "access_token",
          title: "Trakt Access Token",
          type: "password",
          value: ""
        },
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ]
    },
    {
      title: "Trakt 剧集推荐",
      description: "获取你的 Trakt 个性化剧集推荐",
      requiresWebView: false,
      functionName: "fetchTraktShowRecommendations",
      cacheDuration: 1800,
      params: [
        {
          name: "client_id",
          title: "Trakt Client ID",
          type: "input",
          value: ""
        },
        {
          name: "access_token",
          title: "Trakt Access Token",
          type: "password",
          value: ""
        },
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ]
    }
  ]
};

const TRAKT_CONFIG = {
  BASE_URL: "https://api.trakt.tv",
  PER_PAGE: 20,
  POSTER_BASE: "https://image.tmdb.org/t/p/w500"
};

function buildDescription(item, mediaType) {
  const parts = [];

  const year = item.year || "";
  if (year) parts.push(`年份: ${year}`);

  if (mediaType === "show") {
    const status = item.status || "";
    if (status) parts.push(`状态: ${status}`);
  }

  const overview = (item.overview || "").trim();
  if (overview) parts.push(overview);

  return parts.join(" ｜ ");
}

function validateParams(params) {
  const clientId = (params.client_id || "").trim();
  const accessToken = (params.access_token || "").trim();

  if (!clientId) {
    throw new Error("请填写 Trakt Client ID");
  }

  if (!accessToken) {
    throw new Error("请填写 Trakt Access Token");
  }

  return { clientId, accessToken };
}

async function traktGet(path, queryParams = {}, clientId, accessToken) {
  const query = new URLSearchParams(queryParams).toString();
  const url = `${TRAKT_CONFIG.BASE_URL}${path}${query ? `?${query}` : ""}`;

  const response = await Widget.http.get(url, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "Authorization": `Bearer ${accessToken}`
    }
  });

  return response?.data || [];
}

async function tmdbGetDetail(tmdbId, mediaType) {
  if (!tmdbId) return null;

  try {
    const type = mediaType === "movie" ? "movie" : "tv";
    const response = await Widget.tmdb.get(`/${type}/${tmdbId}`, {
      params: {
        language: "zh-CN"
      }
    });

    return response?.data || response || null;
  } catch (e) {
    return null;
  }
}

function mapToForwardItem(traktWrapper, tmdbDetail, mediaKind) {
  const item = traktWrapper[mediaKind];
  const ids = item?.ids || {};

  const title = (tmdbDetail?.title || tmdbDetail?.name || item?.title || "未知标题").trim();
  const releaseDate =
    tmdbDetail?.release_date ||
    tmdbDetail?.first_air_date ||
    (item?.year ? `${item.year}-01-01` : "");

  const rating =
    typeof tmdbDetail?.vote_average === "number" && tmdbDetail.vote_average > 0
      ? tmdbDetail.vote_average.toFixed(1)
      : "";

  const posterPath = tmdbDetail?.poster_path
    ? `${TRAKT_CONFIG.POSTER_BASE}${tmdbDetail.poster_path}`
    : "";

  const backdropPath = tmdbDetail?.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${tmdbDetail.backdrop_path}`
    : "";

  const overview = tmdbDetail?.overview || item?.overview || "";
  const traktUrl = `https://trakt.tv/${mediaKind === "movie" ? "movies" : "shows"}/${ids.slug || ""}`;

  return {
    id: String(ids.tmdb || ids.trakt || ids.slug || title),
    type: "link",
    title,
    posterPath,
    backdropPath,
    releaseDate,
    mediaType: mediaKind === "movie" ? "movie" : "tv",
    rating,
    description: buildDescription(
      {
        year: item?.year,
        status: tmdbDetail?.status || "",
        overview
      },
      mediaKind
    ),
    genreTitle: Array.isArray(tmdbDetail?.genres) && tmdbDetail.genres.length
      ? tmdbDetail.genres.map(g => g.name).join(", ")
      : null,
    link: traktUrl
  };
}

async function fetchTraktRecommendations(mediaKind, params = {}) {
  const { clientId, accessToken } = validateParams(params);
  const pageNum = parseInt(params.page || "1", 10) || 1;

  const path =
    mediaKind === "movie"
      ? "/recommendations/movies"
      : "/recommendations/shows";

  const list = await traktGet(
    path,
    {
      page: pageNum,
      limit: TRAKT_CONFIG.PER_PAGE,
      ignore_collected: "false",
      ignore_watchlisted: "false"
    },
    clientId,
    accessToken
  );

  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const results = [];
  const concurrency = 6;

  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        const item = entry[mediaKind];
        if (!item) return null;

        const tmdbId = item?.ids?.tmdb;
        const tmdbDetail = await tmdbGetDetail(tmdbId, mediaKind);
        return mapToForwardItem(entry, tmdbDetail, mediaKind);
      })
    );

    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

async function fetchTraktMovieRecommendations(params = {}) {
  return await fetchTraktRecommendations("movie", params);
}

async function fetchTraktShowRecommendations(params = {}) {
  return await fetchTraktRecommendations("show", params);
}
