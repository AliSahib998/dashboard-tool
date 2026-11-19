package az.birbank.dashboard.query;

import az.birbank.dashboard.common.BadRequestException;
import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.Statements;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SetOperationList;

/**
 * First line of defence: only a single SELECT (or WITH ... SELECT) statement is allowed.
 * The connection is also opened read-only, and data sources should use a read-only database user,
 * so this check is not the only protection.
 */
public final class SqlGuard {

    private SqlGuard() {}

    public static String validate(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new BadRequestException("SQL is empty");
        }
        String trimmed = sql.strip();
        while (trimmed.endsWith(";")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1).stripTrailing();
        }

        Statements statements;
        try {
            statements = CCJSqlParserUtil.parseStatements(trimmed);
        } catch (JSQLParserException e) {
            throw new BadRequestException("Could not parse SQL. Only standard SELECT queries are allowed. "
                + firstLine(e.getMessage()));
        }
        if (statements.size() != 1) {
            throw new BadRequestException("Only one statement can be run at a time");
        }
        Statement stmt = statements.get(0);
        if (!(stmt instanceof Select select)) {
            throw new BadRequestException("Only SELECT queries are allowed");
        }
        checkSelect(select);
        return trimmed;
    }

    private static void checkSelect(Select select) {
        if (select instanceof PlainSelect ps) {
            if (ps.getIntoTables() != null && !ps.getIntoTables().isEmpty()) {
                throw new BadRequestException("SELECT ... INTO is not allowed");
            }
            if (ps.getForMode() != null) {
                throw new BadRequestException("SELECT ... FOR UPDATE / SHARE is not allowed");
            }
        } else if (select instanceof SetOperationList list) {
            list.getSelects().forEach(SqlGuard::checkSelect);
        }
        if (select.getWithItemsList() != null) {
            select.getWithItemsList().forEach(w -> {
                if (w.getSelect() != null) checkSelect(w.getSelect());
            });
        }
    }

    private static String firstLine(String msg) {
        if (msg == null) return "";
        int nl = msg.indexOf('\n');
        return nl > 0 ? msg.substring(0, nl) : msg;
    }
}
