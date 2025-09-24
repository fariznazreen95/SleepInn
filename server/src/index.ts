import cors from "cors";
import cookieParser from "cookie-parser";
import hostListings from "./routes/hostListings";
import photos from "./routes/photos";

// CORS
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],      // e.g. http://localhost:5173
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.use("/api/host/listings", hostListings);
app.use("/api/host/listings", photos); // so /:id/photos/confirm works
app.use("/api/photos", photos);        // for /photos/presign
