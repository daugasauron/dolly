/* SPDX-License-Identifier: MIT
 * NetSurf's libcurl fetcher (content/fetchers/curl.c) on Dolly's libcurl,
 * which speaks through the browser's fetch. Included before that file.
 *
 * NetSurf gives up on a fetch, or on libcurl altogether, when an option is
 * refused, and Dolly's libcurl refuses what the browser decides for itself.
 * The refusals NetSurf can live with are named here, each with its reason;
 * every other refusal stays the failure it is. */
#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <curl/curl.h>

#include "version.h"  /* DOLLY_VERSION, as the amy command has it */

/* The API NetSurf is to use: the progress callback of before 7.32, which is the
 * one Dolly's libcurl calls, and the form API's names of before 7.56 (there is
 * no MIME API either: netsurf-dolly.patch refuses a multipart post first). */
#undef LIBCURL_VERSION_NUM
#define LIBCURL_VERSION_NUM 0x071f00

/* site:/FILE is a file of the site this release is served from, wherever that is: the broker takes
 * the path /vVERSION/FILE for it, and never tells a program the origin. (NetSurf spells an address
 * without a host site:///FILE, as it does file:///FILE.) */
static inline const char *netsurf_option_string( CURLoption option, const char *string )
{
    static char path[4096];

    if (option != CURLOPT_URL || !string || strncmp( string, "site:///", 8 )) return string;
    snprintf( path, sizeof(path), "/v" DOLLY_VERSION "%s", string + 7 );
    return path;
}

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
    netsurf_easy_setopt_result( option, (value) == 0, (curl_easy_setopt)( handle, option, \
        _Generic( (value), const char *: netsurf_option_string( option, (const char *)(uintptr_t)(value) ), default: (value) ) ) )

/* The broker refuses a redirect that the request did not ask to follow, and NetSurf follows its own.
 * So libcurl is asked to; it names the last address only when the transfer is done, and until then
 * the body is kept here (netsurf-dolly.patch, fetch_curl_done). Under an explicit policy rule the
 * broker follows none, and the fetch fails. */
#define curl_multi_add_handle(multi, easy) \
    ((curl_easy_setopt)( easy, CURLOPT_FOLLOWLOCATION, 1L ), (curl_multi_add_handle)( multi, easy ))

static inline size_t netsurf_hold( char **held, size_t *held_len, const char *data, size_t len )
{
    char *grown = realloc( *held, *held_len + len );

    if (!grown) return 0;
    memcpy( grown + *held_len, data, len );
    *held = grown;
    *held_len += len;
    return len;
}

/* A request with a header outside the CORS safelist makes the browser ask the other site's leave
 * first (a preflight), which a static host does not give. NetSurf's "Pragma:" and "Expect:", libcurl's
 * way to drop its own headers, reach fetch as headers; its cache validators, Referer and DNT are
 * such headers too. Only what the safelist admits is kept (Fetch, "CORS-safelisted request-header"):
 * Accept, Accept-Language, Content-Language and the Content-Type of a form or plain text, of at most
 * 128 bytes without the bytes it excludes. NetSurf takes an empty list for failure, so a header left
 * out of one becomes the Accept the browser sends anyway. */
static inline struct curl_slist *netsurf_slist_append( struct curl_slist *list, const char *header )
{
    const char *value = strchr( header, ':' );
    size_t name = value ? (size_t)(value - header) : 0, i;
    int keep = 0;

    if (value)
    {
        for (value++; *value == ' '; value++) {}
        if (name == 6 && !strncasecmp( header, "Accept", 6 )) keep = 1;
        else if ((name == 15 && !strncasecmp( header, "Accept-Language", 15 )) ||
                 (name == 16 && !strncasecmp( header, "Content-Language", 16 ))) keep = 2;
        else if (name == 12 && !strncasecmp( header, "Content-Type", 12 ))
            keep = !strncasecmp( value, "application/x-www-form-urlencoded", 33 ) ||
                   !strncasecmp( value, "multipart/form-data", 19 ) || !strncasecmp( value, "text/plain", 10 );
        if (!*value || strlen( value ) > 128) keep = 0;
        for (i = 0; keep && value[i]; i++)
        {
            unsigned char c = value[i];
            if (keep == 2 ? !(isalnum( c ) || strchr( " *,-.;=", c ))
                          : (c < 0x20 && c != '\t') || strchr( "\"():<>?@[\\]{}\x7f", c ) != NULL) keep = 0;
        }
    }
    if (keep) return (curl_slist_append)( list, header );
    return list ? list : (curl_slist_append)( NULL, "Accept: */*" );
}
#define curl_slist_append(list, header) netsurf_slist_append( list, header )

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
