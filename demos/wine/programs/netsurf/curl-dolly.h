/* SPDX-License-Identifier: MIT
 * NetSurf's libcurl fetcher (content/fetchers/curl.c) on Dolly's libcurl,
 * which speaks through the browser's fetch. Included before that file.
 *
 * NetSurf gives up on a fetch, or on libcurl altogether, when an option is
 * refused, and Dolly's libcurl refuses what the browser decides for itself.
 * The refusals NetSurf can live with are named here, each with its reason;
 * every other refusal stays the failure it is. */
#include <curl/curl.h>

/* The API NetSurf is to use: the progress callback of before 7.32, which is the
 * one Dolly's libcurl calls, and the form API's names of before 7.56 (there is
 * no MIME API either: netsurf-dolly.patch refuses a multipart post first). */
#undef LIBCURL_VERSION_NUM
#define LIBCURL_VERSION_NUM 0x071f00

static inline CURLcode netsurf_easy_setopt_result( CURLoption option, int off, CURLcode code )
{
    if (code != CURLE_NOT_BUILT_IN && code != CURLE_UNKNOWN_OPTION) return code;
    switch ((int)option)
    {
    /* how long a connection may stall or take to open, the signal libcurl's resolver would
     * use, HTTP/1.1 preferred to libcurl's own HTTP/2, TLS session reuse: the browser's */
    case CURLOPT_LOW_SPEED_LIMIT: case CURLOPT_LOW_SPEED_TIME: case CURLOPT_CONNECTTIMEOUT:
    case CURLOPT_NOSIGNAL: case CURLOPT_HTTP_VERSION: case CURLOPT_SSL_SESSIONID_CACHE:
        return CURLE_OK;
    /* turned off, which they always are here: no proxy, no Cookie header of NetSurf's (the
     * browser keeps the cookies), no multipart body */
    case CURLOPT_PROXY: case CURLOPT_COOKIE: case CURLOPT_HTTPPOST:
        return off ? CURLE_OK : code;
    }
    return code;
}
#define curl_easy_setopt(handle, option, value) \
    netsurf_easy_setopt_result( option, (value) == 0, (curl_easy_setopt)( handle, option, value ) )

/* The sizes of libcurl's connection cache and pool: the browser pools connections by its rules. */
static inline CURLMcode netsurf_multi_setopt_result( CURLMoption option, CURLMcode code )
{
    return code == CURLM_UNKNOWN_OPTION && (option == CURLMOPT_MAXCONNECTS || option == CURLMOPT_MAX_TOTAL_CONNECTIONS)
        ? CURLM_OK : code;
}
#define curl_multi_setopt(multi, option, value) \
    netsurf_multi_setopt_result( option, (curl_multi_setopt)( multi, option, value ) )

/* Dolly's libcurl moves each transfer by one header line or block of body a call and tells
 * through curl_multi_timeout whether more is ready at once; NetSurf polls ten times a second. */
static inline CURLMcode netsurf_multi_perform( CURLM *multi, int *running )
{
    CURLMcode code;
    long wait = 0;
    int rounds = 0;

    do code = (curl_multi_perform)( multi, running );
    while (code == CURLM_OK && *running && curl_multi_timeout( multi, &wait ) == CURLM_OK && !wait && ++rounds < 256);
    return code;
}
#define curl_multi_perform(multi, running) netsurf_multi_perform( multi, running )
