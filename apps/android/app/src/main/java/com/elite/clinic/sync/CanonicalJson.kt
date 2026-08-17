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
        is Boolean, is Number -> value.toString()
        else -> JSONObject.quote(value.toString())
    }

    fun copyWithout(json: JSONObject, vararg fieldNames: String): JSONObject {
        val copy = JSONObject(json.toString())
        fieldNames.forEach(copy::remove)
        return copy
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
