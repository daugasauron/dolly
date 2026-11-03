// The openblas package's BLAS and LAPACK, called as SciPy calls them: CBLAS,
// and LAPACK's subroutines declared void. A product, a solve, a Cholesky and a
// QR factorization of known results, then the time of a product and a solve
// of N by N (argv[1]).
#include <cblas.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

void dgesv_(int *n, int *nrhs, double *a, int *lda, int *ipiv, double *b, int *ldb, int *info);
void dpotrf_(char *uplo, int *n, double *a, int *lda, int *info);
void dgeqrf_(int *m, int *n, double *a, int *lda, double *tau, double *work, int *lwork, int *info);

static double seconds(void) {
  struct timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return now.tv_sec + now.tv_nsec * 1e-9;
}

static int known(void) {
  double a[4] = {1, 3, 2, 4}, b[4] = {5, 7, 6, 8}, c[4];  // column-major
  cblas_dgemm(CblasColMajor, CblasNoTrans, CblasNoTrans, 2, 2, 2, 1, a, 2, b, 2, 0, c, 2);
  if (c[0] != 19 || c[1] != 43 || c[2] != 22 || c[3] != 50) return 1;
  int n = 2, one = 1, ipiv[2], info;
  double m[4] = {3, 1, 1, 2}, x[2] = {9, 8};
  dgesv_(&n, &one, m, &n, ipiv, x, &n, &info);
  if (info != 0 || fabs(x[0] - 2) > 1e-12 || fabs(x[1] - 3) > 1e-12) return 2;
  double s[4] = {4, 2, 2, 3};
  dpotrf_("L", &n, s, &n, &info);
  if (info != 0 || s[0] != 2 || s[1] != 1 || fabs(s[3] - sqrt(2)) > 1e-12) return 3;
  int rows = 3, lwork = 64;
  double q[6] = {3, 0, 4, 1, 1, 1}, tau[2], work[64];
  dgeqrf_(&rows, &n, q, &rows, tau, work, &lwork, &info);
  if (info != 0 || fabs(fabs(q[0]) - 5) > 1e-12) return 4;
  return 0;
}

int main(int argc, char **argv) {
  int failed = known();
  if (failed) return failed;
  int n = argc > 1 ? atoi(argv[1]) : 500, one = 1, info;
  double *a = malloc(sizeof(double) * n * n), *b = malloc(sizeof(double) * n * n);
  double *c = malloc(sizeof(double) * n * n), *x = malloc(sizeof(double) * n);
  int *ipiv = malloc(sizeof(int) * n);
  srand(1);
  for (int i = 0; i < n * n; i++) a[i] = rand() / (double)RAND_MAX, b[i] = rand() / (double)RAND_MAX;
  for (int i = 0; i < n; i++) a[i * n + i] += n, x[i] = 1;
  double started = seconds();
  cblas_dgemm(CblasColMajor, CblasNoTrans, CblasNoTrans, n, n, n, 1, a, n, b, n, 0, c, n);
  double product = seconds() - started;
  started = seconds();
  dgesv_(&n, &one, a, &n, ipiv, x, &n, &info);
  double solve = seconds() - started;
  printf("OPENBLAS-OK n %d: product %.3f s (%.1f GFLOP/s), solve %.3f s\n", n, product,
         2.0 * n * n * n / product / 1e9, solve);
  return info != 0;
}
