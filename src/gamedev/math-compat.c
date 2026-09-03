#include <math.h>
#include <stdlib.h>

int abs(int value) { return value < 0 ? -value : value; }
float asinf(float value) { return (float)asin((double)value); }
float atan2f(float left, float right) {
  return (float)atan2((double)left, (double)right);
}
float ceilf(float value) { return (float)ceil((double)value); }
float fabsf(float value) { return (float)fabs((double)value); }
float floorf(float value) { return (float)floor((double)value); }
double fmax(double left, double right) {
  if (left != left) return right;
  if (right != right) return left;
  return left > right ? left : right;
}
double fmin(double left, double right) {
  if (left != left) return right;
  if (right != right) return left;
  return left < right ? left : right;
}
float fmodf(float left, float right) {
  return (float)fmod((double)left, (double)right);
}
float hypotf(float left, float right) {
  return (float)hypot((double)left, (double)right);
}
float powf(float left, float right) {
  return (float)pow((double)left, (double)right);
}
float roundf(float value) { return (float)round((double)value); }
float sqrtf(float value) { return (float)sqrt((double)value); }
