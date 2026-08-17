package com.elite.clinic.sync

import org.json.JSONArray
import org.json.JSONObject
import java.util.TreeMap

/** Canonical JSON for cross-platform hash and signature verification. */
object CanonicalJson {
    fun encode(value: Any?): String = when (value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> encodeObject(value)
        is JSONArray -> encodeArray(value)
        is String -> JSONObject.quote(value)
        is Boolean -> value.toString()
        is Number -> encodeNumber(value)
        else -> throw IllegalArgumentException(
            "ELITE_CANONICAL_JSON_TYPE: unsupported value type ${value::class.java.name}",
        )
    }

    fun copyWithout(json: JSONObject, vararg fieldNames: String): JSONObject {
        val copy = JSONObject(json.toString())
        fieldNames.forEach(copy::remove)
        return copy
    }

    private fun encodeNumber(value: Number): String {
        val doubleValue = value.toDouble()
        if (!doubleValue.isFinite() || doubleValue % 1.0 != 0.0) {
            throw IllegalArgumentException("ELITE_CANONICAL_JSON_NUMBER: safe integers only")
        }
        if (kotlin.math.abs(doubleValue) > 9_007_199_254_740_991.0) {
            throw IllegalArgumentException("ELITE_CANONICAL_JSON_NUMBER: safe integers only")
        }
        val longValue = value.toLong()
        if (
            longValue.toDouble() != doubleValue ||
            longValue == Long.MIN_VALUE
        ) {
            throw IllegalArgumentException("ELITE_CANONICAL_JSON_NUMBER: safe integers only")
        }
        return longValue.toString()
    }

    private fun encodeObject(json: JSONObject): String {
        val values = TreeMap<String, Any?>()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            values[key] = json.opt(key)
        }
        return values.entries.joinToString(
            prefix = "{",
            postfix = "}",
            separator = ",",
        ) { (key, value) -> "${JSONObject.quote(key)}:${encode(value)}" }
    }

    private fun encodeArray(json: JSONArray): String = buildString {
        append('[')
        for (index in 0 until json.length()) {
            if (index > 0) append(',')
            append(encode(json.opt(index)))
        }
        append(']')
    }
}
