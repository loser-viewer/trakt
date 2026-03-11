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
          type: "input",
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
          type: "input",
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

var TRAKT_CONFIG = {
  BASE_URL: "https://api.trakt.tv",
  PER_PAGE: 20,
  POSTER_BASE: "https://image.tmdb.org/t/p/w500",
  BACKDROP_BASE: "https://image.tmdb.org/t/p/w780"
};

function buildQuery(params) {
  params = params || {};
  var arr = [];
  var key;
  for (key in params) {
    if (params.hasOwnProperty(key)) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
        arr.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    }
  }
  return arr.join("&");
}

function buildDescription(item, mediaType) {
  item = item || {};
  var parts = [];

  if (item.year) {
    parts.push("年份: " + item.year);
  }

  if (mediaType === "show" && item.status) {
    parts.push("状态: " + item.status);
  }

  if (item.overview) {
    parts.push(String(item.overview).trim());
  }

  return parts.join(" ｜ ");
}

function validateParams(params) {
  params = params || {};
  var clientId = String(params.client_id || "").trim();
  var accessToken = String(params.access_token || "").trim();

  if (!clientId) {
    throw new Error("请填写 Trakt Client ID");
  }

  if (!accessToken) {
    throw new Error("请填写 Trakt Access Token");
  }

  return {
    clientId: clientId,
    accessToken: accessToken
  };
}

async function traktGet(path, queryParams, clientId, accessToken) {
  queryParams = queryParams || {};
  var query = buildQuery(queryParams);
  var url = TRAKT_CONFIG.BASE_URL + path + (query ? ("?" + query) : "");

  var response = await Widget.http.get(url, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
      "Authorization": "Bearer " + accessToken
    }
  });

  return (response && response.data) ? response.data : [];
}

async function tmdbGetDetail(tmdbId, mediaType) {
  if (!tmdbId) return null;

  try {
    var type = mediaType === "movie" ? "movie" : "tv";
    var response = await Widget.tmdb.get("/" + type + "/" + tmdbId, {
      params: {
        language: "zh-CN"
      }
    });

    if (response && response.data) return response.data;
    if (response) return response;
    return null;
  } catch (e) {
    return null;
  }
}

function mapGenres(genres) {
  if (!genres || !genres.length) return null;
  return genres.map(function(g) {
    return g.name;
  }).join(", ");
}

function mapToForwardItem(traktWrapper, tmdbDetail, mediaKind) {
  var item = traktWrapper ? traktWrapper[mediaKind] : null;
  var ids = (item && item.ids) ? item.ids : {};

  var title = "未知标题";
  if (tmdbDetail && tmdbDetail.title) title = String(tmdbDetail.title).trim();
  else if (tmdbDetail && tmdbDetail.name) title = String(tmdbDetail.name).trim();
  else if (item && item.title) title = String(item.title).trim();

  var releaseDate = "";
  if (tmdbDetail && tmdbDetail.release_date) releaseDate = tmdbDetail.release_date;
  else if (tmdbDetail && tmdbDetail.first_air_date) releaseDate = tmdbDetail.first_air_date;
  else if (item && item.year) releaseDate = item.year + "-01-01";

  var rating = "";
  if (tmdbDetail && typeof tmdbDetail.vote_average === "number" && tmdbDetail.vote_average > 0) {
    rating = tmdbDetail.vote_average.toFixed(1);
  }

  var posterPath = "";
  if (tmdbDetail && tmdbDetail.poster_path) {
    posterPath = TRAKT_CONFIG.POSTER_BASE + tmdbDetail.poster_path;
  }

  var backdropPath = "";
  if (tmdbDetail && tmdbDetail.backdrop_path) {
    backdropPath = TRAKT_CONFIG.BACKDROP_BASE + tmdbDetail.backdrop_path;
  }

  var overview = "";
  if (tmdbDetail && tmdbDetail.overview) overview = tmdbDetail.overview;
  else if (item && item.overview) overview = item.overview;

  var slug = ids.slug || "";
  var traktUrl = "https://trakt.tv/" + (mediaKind === "movie" ? "movies" : "shows") + "/" + slug;

  return {
    id: String(ids.tmdb || ids.trakt || ids.slug || title),
    type: "link",
    title: title,
    posterPath: posterPath,
    backdropPath: backdropPath,
    releaseDate: releaseDate,
    mediaType: mediaKind === "movie" ? "movie" : "tv",
    rating: rating,
    description: buildDescription({
      year: item ? item.year : "",
      status: tmdbDetail ? (tmdbDetail.status || "") : "",
      overview: overview
    }, mediaKind),
    genreTitle: mapGenres(tmdbDetail ? tmdbDetail.genres : null),
    link: traktUrl
  };
}

async function fetchTraktRecommendations(mediaKind, params) {
  params = params || {};
  var validated = validateParams(params);
  var clientId = validated.clientId;
  var accessToken = validated.accessToken;
  var pageNum = parseInt(params.page || "1", 10) || 1;

  var path = mediaKind === "movie" ? "/recommendations/movies" : "/recommendations/shows";

  var list = await traktGet(
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

  if (!list || !list.length) {
    return [];
  }

  var results = [];
  var concurrency = 6;
  var i, batch, batchResults, j;

  for (i = 0; i < list.length; i += concurrency) {
    batch = list.slice(i, i + concurrency);

    batchResults = await Promise.all(batch.map(async function(entry) {
      var item = entry;
      var tmdbId, tmdbDetail;

      if (!item) return null;

      tmdbId = item.ids ? item.ids.tmdb : null;
      tmdbDetail = await tmdbGetDetail(tmdbId, mediaKind);

      return mapToForwardItem({[mediaKind]: item}, tmdbDetail, mediaKind);
    }));

    for (j = 0; j < batchResults.length; j++) {
      if (batchResults[j]) {
        results.push(batchResults[j]);
      }
    }
  }

  return results;
}

async function fetchTraktMovieRecommendations(params) {
  return await fetchTraktRecommendations("movie", params || {});
}

async function fetchTraktShowRecommendations(params) {
  return await fetchTraktRecommendations("show", params || {});
}
