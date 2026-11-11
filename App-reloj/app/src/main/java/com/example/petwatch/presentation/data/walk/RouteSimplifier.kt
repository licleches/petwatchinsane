package com.example.petwatch.presentation.data.walk

import com.example.petwatch.presentation.data.model.RoutePoint
import kotlin.math.cos
import kotlin.math.hypot

/**
 * Reduce la ruta a máximo [MAX_POINTS] puntos: quita puntos casi repetidos (GPS
 * quieto) y aplica Ramer–Douglas–Peucker con la menor tolerancia que cumpla el
 * límite, así la forma del recorrido se conserva.
 */
object RouteSimplifier {
    const val MAX_POINTS = 2000
    private const val EARTH_RADIUS_M = 6_371_000.0
    private const val MIN_SPACING_M = 2.0
    private const val MAX_EPSILON_M = 200.0

    fun simplify(points: List<RoutePoint>, maxPoints: Int = MAX_POINTS): List<RoutePoint> {
        val valid = points
            .filter { it.lat in -90.0..90.0 && it.lng in -180.0..180.0 && it.lat.isFinite() && it.lng.isFinite() }
            .sortedBy { it.t }
        if (valid.size <= 2) return valid

        val spaced = dropNearby(valid)
        if (spaced.size <= maxPoints) return spaced

        var best = uniformSample(spaced, maxPoints)
        var low = 0.0
        var high = MAX_EPSILON_M
        repeat(20) {
            val epsilon = (low + high) / 2
            val candidate = douglasPeucker(spaced, epsilon)
            if (candidate.size <= maxPoints) {
                best = candidate
                high = epsilon
            } else {
                low = epsilon
            }
        }
        return if (best.size <= maxPoints) best else uniformSample(best, maxPoints)
    }

    private fun dropNearby(points: List<RoutePoint>): List<RoutePoint> {
        val result = ArrayList<RoutePoint>(points.size)
        result += points.first()
        for (index in 1 until points.lastIndex) {
            if (distanceMeters(result.last(), points[index]) >= MIN_SPACING_M) result += points[index]
        }
        result += points.last()
        return result
    }

    private fun uniformSample(points: List<RoutePoint>, maxPoints: Int): List<RoutePoint> {
        if (points.size <= maxPoints) return points
        val step = (points.size - 1).toDouble() / (maxPoints - 1)
        return List(maxPoints) { index -> points[(index * step).toInt().coerceAtMost(points.lastIndex)] }
            .distinct()
    }

    private fun douglasPeucker(points: List<RoutePoint>, epsilon: Double): List<RoutePoint> {
        val lat0 = Math.toRadians(points.first().lat)
        val x = DoubleArray(points.size) { Math.toRadians(points[it].lng) * cos(lat0) * EARTH_RADIUS_M }
        val y = DoubleArray(points.size) { Math.toRadians(points[it].lat) * EARTH_RADIUS_M }
        val keep = BooleanArray(points.size)
        keep[0] = true
        keep[points.lastIndex] = true
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(0 to points.lastIndex)
        while (stack.isNotEmpty()) {
            val (start, end) = stack.removeLast()
            var maxDistance = 0.0
            var farthest = -1
            for (index in start + 1 until end) {
                val distance = segmentDistance(x[index], y[index], x[start], y[start], x[end], y[end])
                if (distance > maxDistance) {
                    maxDistance = distance
                    farthest = index
                }
            }
            if (farthest != -1 && maxDistance > epsilon) {
                keep[farthest] = true
                stack.addLast(start to farthest)
                stack.addLast(farthest to end)
            }
        }
        return points.filterIndexed { index, _ -> keep[index] }
    }

    private fun segmentDistance(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
        val dx = bx - ax
        val dy = by - ay
        val lengthSquared = dx * dx + dy * dy
        if (lengthSquared == 0.0) return hypot(px - ax, py - ay)
        val t = (((px - ax) * dx + (py - ay) * dy) / lengthSquared).coerceIn(0.0, 1.0)
        return hypot(px - (ax + t * dx), py - (ay + t * dy))
    }

    fun distanceMeters(a: RoutePoint, b: RoutePoint): Double {
        val lat = Math.toRadians((a.lat + b.lat) / 2)
        val dx = Math.toRadians(b.lng - a.lng) * cos(lat) * EARTH_RADIUS_M
        val dy = Math.toRadians(b.lat - a.lat) * EARTH_RADIUS_M
        return hypot(dx, dy)
    }
}
