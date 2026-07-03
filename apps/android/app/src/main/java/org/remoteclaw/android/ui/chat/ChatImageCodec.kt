package org.remoteclaw.android.ui.chat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.LruCache
import kotlin.math.max

private const val CHAT_DECODE_MAX_DIMENSION = 1600
private const val CHAT_IMAGE_CACHE_BYTES = 16 * 1024 * 1024

private val decodedBitmapCache =
  object : LruCache<String, Bitmap>(CHAT_IMAGE_CACHE_BYTES) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount.coerceAtLeast(1)
  }

internal fun decodeBase64Bitmap(base64: String, maxDimension: Int = CHAT_DECODE_MAX_DIMENSION): Bitmap? {
  val cacheKey = "$maxDimension:${base64.length}:${base64.hashCode()}"
  decodedBitmapCache.get(cacheKey)?.let { return it }

  val bytes = Base64.decode(base64, Base64.DEFAULT)
  if (bytes.isEmpty()) return null

  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
  if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

  val bitmap =
    BitmapFactory.decodeByteArray(
      bytes,
      0,
      bytes.size,
      BitmapFactory.Options().apply {
        inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, maxDimension)
        inPreferredConfig = Bitmap.Config.RGB_565
      },
    ) ?: return null

  decodedBitmapCache.put(cacheKey, bitmap)
  return bitmap
}

internal fun computeInSampleSize(width: Int, height: Int, maxDimension: Int): Int {
  if (width <= 0 || height <= 0 || maxDimension <= 0) return 1

  var sample = 1
  var longestEdge = max(width, height)
  while (longestEdge > maxDimension && sample < 64) {
    sample *= 2
    longestEdge = max(width / sample, height / sample)
  }
  return sample.coerceAtLeast(1)
}
