package az.birbank.dashboard.mongo;

import az.birbank.dashboard.common.BadRequestException;
import org.bson.BsonArray;
import org.bson.BsonDocument;
import org.bson.BsonValue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Only read-only aggregation stages are allowed. Stages that write ($out, $merge) or run
 * server-side JavaScript ($function, $accumulator, $where) are rejected anywhere in the pipeline,
 * including inside $lookup, $facet and $unionWith sub-pipelines.
 * Data sources should also use a MongoDB user with only the "read" role.
 */
public final class MongoPipelineGuard {

    private static final Set<String> ALLOWED_STAGES = Set.of(
        "$match", "$group", "$sort", "$limit", "$skip", "$project", "$addFields", "$set", "$unset",
        "$unwind", "$lookup", "$count", "$facet", "$bucket", "$bucketAuto", "$sortByCount", "$replaceRoot",
        "$replaceWith", "$sample", "$densify", "$fill", "$setWindowFields", "$unionWith", "$graphLookup",
        "$redact", "$geoNear");

    private static final Set<String> FORBIDDEN_ANYWHERE = Set.of(
        "$out", "$merge", "$function", "$accumulator", "$where");

    private MongoPipelineGuard() {}

    public static void validateCollection(String collection) {
        if (collection == null || collection.isBlank()) {
            throw new BadRequestException("Choose a collection");
        }
        if (collection.startsWith("system.") || collection.contains("$")) {
            throw new BadRequestException("This collection cannot be queried");
        }
    }

    public static List<BsonDocument> parse(String pipelineText) {
        if (pipelineText == null || pipelineText.isBlank()) {
            throw new BadRequestException("Pipeline is empty. Use [] to return documents as they are.");
        }
        BsonArray array;
        try {
            array = BsonArray.parse(pipelineText.strip());
        } catch (RuntimeException e) {
            throw new BadRequestException("Pipeline must be a JSON array of stages, e.g. [{ \"$match\": { } }]. "
                + e.getMessage());
        }

        List<BsonDocument> stages = new ArrayList<>(array.size());
        for (BsonValue v : array) {
            if (!v.isDocument() || v.asDocument().size() != 1) {
                throw new BadRequestException("Each pipeline stage must be an object with exactly one stage name, e.g. { \"$match\": {...} }");
            }
            String stage = v.asDocument().getFirstKey();
            if (!ALLOWED_STAGES.contains(stage)) {
                throw new BadRequestException("Stage " + stage + " is not allowed");
            }
            stages.add(v.asDocument());
        }
        scan(array);
        return stages;
    }

    private static void scan(BsonValue value) {
        if (value.isDocument()) {
            for (var e : value.asDocument().entrySet()) {
                if (FORBIDDEN_ANYWHERE.contains(e.getKey())) {
                    throw new BadRequestException(e.getKey() + " is not allowed");
                }
                scan(e.getValue());
            }
        } else if (value.isArray()) {
            value.asArray().forEach(MongoPipelineGuard::scan);
        }
    }
}
