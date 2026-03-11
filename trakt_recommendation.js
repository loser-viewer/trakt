WidgetMetadata = {
  id: "trakt_recommendations",
  title: "Trakt 推荐榜单",
  description: "获取 Trakt 个性化推荐电影 / 剧集列表",
  author: "hyl",
  site: "https://github.com/quantumultxx/ForwardWidgets",
  version: "1.2",
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
          name: "sort",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默认排序", value: "default" },
            { title: "随机排序", value: "random" }
          ]
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
          name: "sort",
          title: "排序方式",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "默认排序", value: "default" },
            { title: "随机排序", value: "random" }
          ]
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

function shuffleArray(arr) {
  var newArr = arr.slice();
  for (var i = newArr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = newArr[i];
    newArr[i] = newArr[j];
    newArr[j] = temp;
  }
  return newArr;
}

function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[【】\[\]\(\)（）:：·・,，.\-_'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  var data = response && response.data ? response.data : [];

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      data = [];
    }
  }

  return data;
}

async function tmdbGetDetailById(tmdbId, mediaType) {
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

function getTmdbYear(result) {
  var dateStr = "";
  if (result && result.release_date) dateStr = result.release_date;
  else if (result && result.first_air_date) dateStr = result.first_air_date;

  if (!dateStr || String(dateStr).length < 4) return "";
  return String(dateStr).substring(0, 4);
}

function scoreTmdbCandidate(result, title, year, mediaType) {
  var score = 0;
  var queryTitle = normalizeText(title);
  var resultTitle = normalizeText(
    (result && (result.title || result.name || result.original_title || result.original_name)) || ""
  );
  var resultOriginal = normalizeText(
    (result && (result.original_title || result.original_name)) || ""
  );

  if (!result) return -9999;

  if (queryTitle && resultTitle === queryTitle) score += 120;
  else if (queryTitle && resultOriginal === queryTitle) score += 110;
  else if (queryTitle && resultTitle.indexOf(queryTitle) >= 0) score += 80;
  else if (queryTitle && resultOriginal.indexOf(queryTitle) >= 0) score += 70;
  else {
    var qWords = queryTitle.split(" ");
    var hit = 0;
    for (var i = 0; i < qWords.length; i++) {
      if (qWords[i] && (resultTitle.indexOf(qWords[i]) >= 0 || resultOriginal.indexOf(qWords[i]) >= 0)) {
        hit++;
      }
    }
    score += hit * 10;
  }

  var resultYear = getTmdbYear(result);
  if (year && resultYear) {
    var diff = Math.abs(parseInt(year, 10) - parseInt(resultYear, 10));
    if (diff === 0) score += 40;
    else if (diff === 1) score += 20;
    else if (diff === 2) score += 5;
    else score -= diff * 5;
  }

  if (mediaType === "show") {
    if (result.name || result.original_name) score += 15;
  } else {
    if (result.title || result.original_title) score += 15;
  }

  if (typeof result.vote_count === "number") {
    if (result.vote_count > 100) score += 10;
    else if (result.vote_count > 20) score += 5;
  }

  if (result.adult === true) {
    score -= 300;
  }

  return score;
}

function buildSearchTitles(item) {
  var titles = [];
  var title = item && item.title ? String(item.title).trim() : "";
  var ids = item && item.ids ? item.ids : {};

  if (title) titles.push(title);

  if (ids.slug) {
    var slugTitle = String(ids.slug)
      .replace(/-/g, " ")
      .replace(/\b(us|uk|jp|kr)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (slugTitle) titles.push(slugTitle);
  }

  var uniq = [];
  var map = {};
  for (var i = 0; i < titles.length; i++) {
    var n = normalizeText(titles[i]);
    if (n && !map[n]) {
      map[n] = true;
      uniq.push(titles[i]);
    }
  }
  return uniq;
}

async function tmdbSearchBest(titleList, year, mediaType) {
  if (!titleList || !titleList.length) return null;

  var type = mediaType === "movie" ? "movie" : "tv";
  var best = null;
  var bestScore = -9999;

  for (var i = 0; i < titleList.length; i++) {
    var title = titleList[i];
    if (!title) continue;

    try {
      var params = {
        query: title,
        language: "zh-CN",
        include_adult: false
      };

      if (year) {
        if (type === "movie") {
          params.primary_release_year = year;
        } else {
          params.first_air_date_year = year;
        }
      }

      var response = await Widget.tmdb.get("/search/" + type, {
        params: params
      });

      var data = response && response.data ? response.data : response;
      var results = data && data.results ? data.results : [];

      for (var j = 0; j < results.length; j++) {
        var candidate = results[j];
        var score = scoreTmdbCandidate(candidate, title, year, mediaType);

        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    } catch (e) {}
  }

  return best;
}

async function resolveTmdbDetail(item, mediaType) {
  if (!item) return null;

  var ids = item.ids || {};
  var year = item.year || "";
  var titleList = buildSearchTitles(item);

  if (ids.tmdb) {
    var detailById = await tmdbGetDetailById(ids.tmdb, mediaType);
    if (detailById) return detailById;
  }

  var bestSearchResult = await tmdbSearchBest(titleList, year, mediaType);
  if (!bestSearchResult) return null;

  if (bestSearchResult.id) {
    var detailBySearchId = await tmdbGetDetailById(bestSearchResult.id, mediaType);
    if (detailBySearchId) return detailBySearchId;
  }

  return bestSearchResult;
}

function mapGenres(genres) {
  if (!genres || !genres.length) return null;
  return genres.map(function(g) {
    return g.name;
  }).join(", ");
}

function mapToForwardItem(item, tmdbDetail, mediaKind) {
  item = item || {};
  var ids = item.ids || {};

  var title = "未知标题";
  if (tmdbDetail && tmdbDetail.title) title = String(tmdbDetail.title).trim();
  else if (tmdbDetail && tmdbDetail.name) title = String(tmdbDetail.name).trim();
  else if (item.title) title = String(item.title).trim();

  var releaseDate = "";
  if (tmdbDetail && tmdbDetail.release_date) releaseDate = tmdbDetail.release_date;
  else if (tmdbDetail && tmdbDetail.first_air_date) releaseDate = tmdbDetail.first_air_date;
  else if (item.year) releaseDate = item.year + "-01-01";

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
  else if (item.overview) overview = item.overview;

  var traktUrl = "";
  if (ids.slug) {
    traktUrl = "https://trakt.tv/" + (mediaKind === "movie" ? "movies" : "shows") + "/" + ids.slug;
  }

  var actualTmdbId = ids.tmdb;
  if ((!actualTmdbId) && tmdbDetail && tmdbDetail.id) {
    actualTmdbId = tmdbDetail.id;
  }

  return {
    id: String(actualTmdbId || ids.trakt || ids.slug || title),
    type: "link",
    title: title,
    posterPath: posterPath,
    backdropPath: backdropPath,
    releaseDate: releaseDate,
    mediaType: mediaKind === "movie" ? "movie" : "tv",
    rating: rating,
    description: buildDescription({
      year: item.year || "",
      status: tmdbDetail ? (tmdbDetail.status || "") : "",
      overview: overview || ""
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
  var sort = String(params.sort || "default");

  var path = mediaKind === "movie" ? "/recommendations/movies" : "/recommendations/shows";

  var list = await traktGet(
    path,
    {
      page: pageNum,
      limit: TRAKT_CONFIG.PER_PAGE
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
      var tmdbDetail;

      if (!item) return null;

      tmdbDetail = await resolveTmdbDetail(item, mediaKind);
      return mapToForwardItem(item, tmdbDetail, mediaKind);
    }));

    for (j = 0; j < batchResults.length; j++) {
      if (batchResults[j]) {
        results.push(batchResults[j]);
      }
    }
  }

  if (sort === "random") {
    results = shuffleArray(results);
  }

  return results;
}

async function fetchTraktMovieRecommendations(params) {
  return await fetchTraktRecommendations("movie", params || {});
}

async function fetchTraktShowRecommendations(params) {
  return await fetchTraktRecommendations("show", params || {});
}
