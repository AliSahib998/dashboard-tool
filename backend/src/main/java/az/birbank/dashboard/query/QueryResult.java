package az.birbank.dashboard.query;

import java.util.List;

public record QueryResult(List<ResultColumn> columns, List<List<Object>> rows, int rowCount,
                          boolean truncated, long durationMs) {

    /** type is one of: number, string, date, boolean */
    public record ResultColumn(String name, String type) {}
}
