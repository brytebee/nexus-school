package com.nexus.school.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.math.max
import kotlin.math.min

private val AccentCyan   = Color(0xFF00E5FF)
private val Overlay      = Color(0x99000000)
private val HandleSize   = 28f  // px touch target for corner handles

/**
 * A fullscreen crop dialog built entirely in Compose — no library dependency.
 *
 * The bitmap is drawn scaled-to-fit inside the canvas.  A resizable,
 * draggable crop rect is drawn on top.  Corner handles let the user resize;
 * dragging the interior pans the rect.
 *
 * @param bitmap   The bitmap to crop.
 * @param onCrop   Called with the cropped [Bitmap] on confirm.
 * @param onDismiss Called when the user cancels.
 */
@Composable
fun PhotoCropDialog(
    bitmap: Bitmap,
    onCrop: (Bitmap) -> Unit,
    onDismiss: () -> Unit
) {
    // Canvas render size (set once layout is measured)
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }

    // The crop rect in canvas-local coordinates
    var cropRect by remember { mutableStateOf<Rect?>(null) }

    // Which gesture zone the user is currently dragging
    var dragZone by remember { mutableStateOf(DragZone.NONE) }
    var lastDragPos by remember { mutableStateOf(Offset.Zero) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0A0C1A))
        ) {
            // ── Title bar ────────────────────────────────────────────────────
            Text(
                "Crop Photo",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 20.dp)
            )
            Text(
                "Drag corners to resize · Drag inside to move",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 11.sp,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 42.dp)
            )

            // ── Crop canvas ──────────────────────────────────────────────────
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.8f)
                    .align(Alignment.Center)
                    .onGloballyPositioned { coords ->
                        val sz = coords.size
                        if (sz != canvasSize) {
                            canvasSize = sz
                            // Initialise crop rect to centred square (85% of shorter edge)
                            val (dw, dh) = fitBitmap(bitmap, sz)
                            val ox = (sz.width - dw) / 2f
                            val oy = (sz.height - dh) / 2f
                            val side = min(dw, dh) * 0.85f
                            val cx = ox + dw / 2f
                            val cy = oy + dh / 2f
                            cropRect = Rect(cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
                        }
                    }
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { pos ->
                                val r = cropRect ?: return@detectDragGestures
                                dragZone = hitZone(pos, r)
                                lastDragPos = pos
                            },
                            onDrag = { change, _ ->
                                change.consume()
                                val r = cropRect ?: return@detectDragGestures
                                val delta = change.position - lastDragPos
                                lastDragPos = change.position
                                cropRect = applyDrag(r, dragZone, delta, canvasSize)
                            },
                            onDragEnd = { dragZone = DragZone.NONE }
                        )
                    }
            ) {
                val sz = canvasSize
                if (sz == IntSize.Zero) return@Canvas

                // Draw bitmap scaled-to-fit
                val (dw, dh) = fitBitmap(bitmap, sz)
                val ox = (sz.width - dw) / 2f
                val oy = (sz.height - dh) / 2f
                drawIntoCanvas { canvas ->
                    canvas.drawImageRect(
                        image          = bitmap.asImageBitmap(),
                        srcOffset      = androidx.compose.ui.unit.IntOffset.Zero,
                        srcSize        = androidx.compose.ui.unit.IntSize(bitmap.width, bitmap.height),
                        dstOffset      = androidx.compose.ui.unit.IntOffset(ox.toInt(), oy.toInt()),
                        dstSize        = androidx.compose.ui.unit.IntSize(dw.toInt(), dh.toInt()),
                        paint          = Paint()
                    )
                }

                // Draw dimming outside the crop rect
                val r = cropRect ?: return@Canvas
                drawDimOverlay(r, sz)

                // Crop rect border
                drawRect(
                    color       = AccentCyan,
                    topLeft     = Offset(r.left, r.top),
                    size        = androidx.compose.ui.geometry.Size(r.width, r.height),
                    style       = Stroke(width = 2.5f)
                )

                // Rule-of-thirds grid lines
                val thirdW = r.width / 3f
                val thirdH = r.height / 3f
                for (i in 1..2) {
                    drawLine(AccentCyan.copy(alpha = 0.3f), Offset(r.left + thirdW * i, r.top), Offset(r.left + thirdW * i, r.bottom), strokeWidth = 1f)
                    drawLine(AccentCyan.copy(alpha = 0.3f), Offset(r.left, r.top + thirdH * i), Offset(r.right, r.top + thirdH * i), strokeWidth = 1f)
                }

                // Corner handles
                listOf(
                    Offset(r.left,  r.top),
                    Offset(r.right, r.top),
                    Offset(r.left,  r.bottom),
                    Offset(r.right, r.bottom)
                ).forEach { corner ->
                    drawCircle(AccentCyan, radius = 9f, center = corner)
                    drawCircle(Color.White, radius = 5f, center = corner)
                }
            }

            // ── Action row ──────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Cancel", color = Color.White.copy(alpha = 0.6f), fontSize = 14.sp)
                }
                androidx.compose.material3.Button(
                    onClick = {
                        val r = cropRect ?: return@Button
                        val cropped = extractCrop(bitmap, r, canvasSize)
                        onCrop(cropped)
                    },
                    modifier = Modifier.weight(1f),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = AccentCyan),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Use Photo", color = Color(0xFF0A0C1A), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

private enum class DragZone { NONE, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT, BODY }

/** Returns which part of the rect [pos] hits */
private fun hitZone(pos: Offset, r: Rect): DragZone {
    val hs = HandleSize
    return when {
        dist(pos, Offset(r.left,  r.top))    < hs -> DragZone.TOP_LEFT
        dist(pos, Offset(r.right, r.top))    < hs -> DragZone.TOP_RIGHT
        dist(pos, Offset(r.left,  r.bottom)) < hs -> DragZone.BOTTOM_LEFT
        dist(pos, Offset(r.right, r.bottom)) < hs -> DragZone.BOTTOM_RIGHT
        r.contains(pos)                           -> DragZone.BODY
        else                                      -> DragZone.NONE
    }
}

private fun dist(a: Offset, b: Offset): Float {
    val dx = a.x - b.x
    val dy = a.y - b.y
    return kotlin.math.sqrt(dx * dx + dy * dy)
}

private val MIN_SIDE = 80f

/** Applies a drag delta to the rect according to which zone is being dragged */
private fun applyDrag(r: Rect, zone: DragZone, delta: Offset, canvas: IntSize): Rect {
    val w = canvas.width.toFloat()
    val h = canvas.height.toFloat()
    return when (zone) {
        DragZone.BODY -> {
            val nl = (r.left  + delta.x).coerceIn(0f, w - r.width)
            val nt = (r.top   + delta.y).coerceIn(0f, h - r.height)
            Rect(nl, nt, nl + r.width, nt + r.height)
        }
        DragZone.TOP_LEFT -> {
            val nl = min(r.left + delta.x, r.right - MIN_SIDE).coerceIn(0f, r.right - MIN_SIDE)
            val nt = min(r.top  + delta.y, r.bottom - MIN_SIDE).coerceIn(0f, r.bottom - MIN_SIDE)
            Rect(nl, nt, r.right, r.bottom)
        }
        DragZone.TOP_RIGHT -> {
            val nr = max(r.right + delta.x, r.left + MIN_SIDE).coerceIn(r.left + MIN_SIDE, w)
            val nt = min(r.top   + delta.y, r.bottom - MIN_SIDE).coerceIn(0f, r.bottom - MIN_SIDE)
            Rect(r.left, nt, nr, r.bottom)
        }
        DragZone.BOTTOM_LEFT -> {
            val nl = min(r.left   + delta.x, r.right - MIN_SIDE).coerceIn(0f, r.right - MIN_SIDE)
            val nb = max(r.bottom + delta.y, r.top + MIN_SIDE).coerceIn(r.top + MIN_SIDE, h)
            Rect(nl, r.top, r.right, nb)
        }
        DragZone.BOTTOM_RIGHT -> {
            val nr = max(r.right  + delta.x, r.left + MIN_SIDE).coerceIn(r.left + MIN_SIDE, w)
            val nb = max(r.bottom + delta.y, r.top  + MIN_SIDE).coerceIn(r.top  + MIN_SIDE, h)
            Rect(r.left, r.top, nr, nb)
        }
        DragZone.NONE -> r
    }
}

/** Returns (drawWidth, drawHeight) for bitmap scaled-to-fit inside [size] */
private fun fitBitmap(bitmap: Bitmap, size: IntSize): Pair<Float, Float> {
    val scaleX = size.width.toFloat()  / bitmap.width
    val scaleY = size.height.toFloat() / bitmap.height
    val scale  = min(scaleX, scaleY)
    return bitmap.width * scale to bitmap.height * scale
}

/** Draws a dimming overlay outside the crop rect */
private fun DrawScope.drawDimOverlay(r: Rect, sz: IntSize) {
    val w = sz.width.toFloat()
    val h = sz.height.toFloat()
    // Top
    drawRect(Overlay, topLeft = Offset(0f, 0f),                           size = androidx.compose.ui.geometry.Size(w, r.top))
    // Bottom
    drawRect(Overlay, topLeft = Offset(0f, r.bottom),                     size = androidx.compose.ui.geometry.Size(w, h - r.bottom))
    // Left
    drawRect(Overlay, topLeft = Offset(0f, r.top),                        size = androidx.compose.ui.geometry.Size(r.left, r.height))
    // Right
    drawRect(Overlay, topLeft = Offset(r.right, r.top),                   size = androidx.compose.ui.geometry.Size(w - r.right, r.height))
}

/**
 * Converts the canvas-space crop rect back to bitmap-space and returns the
 * cropped sub-bitmap, resized to max 600px on the longer side.
 */
private fun extractCrop(bitmap: Bitmap, r: Rect, canvas: IntSize): Bitmap {
    val (dw, dh) = fitBitmap(bitmap, canvas)
    val ox = (canvas.width - dw) / 2f
    val oy = (canvas.height - dh) / 2f

    val scaleX = bitmap.width / dw
    val scaleY = bitmap.height / dh

    val bx = ((r.left - ox) * scaleX).toInt().coerceIn(0, bitmap.width  - 1)
    val by = ((r.top  - oy) * scaleY).toInt().coerceIn(0, bitmap.height - 1)
    val bw = (r.width  * scaleX).toInt().coerceIn(1, bitmap.width  - bx)
    val bh = (r.height * scaleY).toInt().coerceIn(1, bitmap.height - by)

    val cropped = Bitmap.createBitmap(bitmap, bx, by, bw, bh)

    // Resize to max 600px long edge
    val maxSide = 600f
    val scale   = min(1f, maxSide / max(cropped.width, cropped.height).toFloat())
    return if (scale < 1f) {
        Bitmap.createScaledBitmap(cropped, (cropped.width * scale).toInt(), (cropped.height * scale).toInt(), true)
    } else cropped
}
