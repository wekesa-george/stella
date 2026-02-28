defmodule TradeEngine.Utils.Math do
  @moduledoc """
  Pure mathematical functions for regression and linear algebra.
  Includes Gaussian Elimination for solving Quadratic Regression.
  """
  require Logger

  # --- Statistics ---
  def standard_deviation(values) do
    if Enum.empty?(values) do
      0.0
    else
      mean = Enum.sum(values) / length(values)
      squared_diffs = Enum.map(values, fn x -> :math.pow(x - mean, 2) end)
      variance = Enum.sum(squared_diffs) / length(values)
      :math.sqrt(variance)
    end
  end

  # --- Linear Regression (y = mx + c) ---
  def linear_regression(x_vals, y_vals) do
    n = length(x_vals)
    if n < 2 do
      {0.0, Enum.sum(y_vals) / max(n, 1), 0.0}
    else
      sum_x = Enum.sum(x_vals)
      sum_y = Enum.sum(y_vals)
      sum_xy = Enum.zip(x_vals, y_vals) |> Enum.map(fn {x, y} -> x * y end) |> Enum.sum()
      sum_x2 = Enum.map(x_vals, fn x -> x * x end) |> Enum.sum()
      
      denominator = n * sum_x2 - sum_x * sum_x
      
      {slope, intercept} = 
        if abs(denominator) < 1.0e-10 do
          {0.0, sum_y / n}
        else
          slope = (n * sum_xy - sum_x * sum_y) / denominator
          intercept = (sum_y - slope * sum_x) / n
          {slope, intercept}
        end
      
      predictions = Enum.map(x_vals, fn x -> intercept + slope * x end)
      r2 = calculate_r_squared(y_vals, predictions)
      
      {slope, intercept, r2}
    end
  end

  def calculate_r_squared(actuals, preds) do
    n = length(actuals)
    if n == 0 do
      0.0
    else
      mean = Enum.sum(actuals) / n
      ss_res = Enum.zip(actuals, preds) |> Enum.map(fn {a, p} -> :math.pow(a - p, 2) end) |> Enum.sum()
      ss_tot = Enum.map(actuals, fn a -> :math.pow(a - mean, 2) end) |> Enum.sum()
      
      if ss_tot < 1.0e-10, do: 0.0, else: max(0.0, 1.0 - (ss_res / ss_tot))
    end
  end

  # --- Quadratic Regression (y = ax^2 + bx + c) ---
  # Returns: acceleration (2 * a)
  def solve_quadratic_regression(x_vals, y_vals) do
    # Construct Matrix X (rows of [1, x, x^2])
    x_matrix = Enum.map(x_vals, fn x -> [1.0, x, x * x] end)
    
    # Solve for coefficients [c, b, a]
    coeffs = solve_ols(x_matrix, y_vals)
    
    # Acceleration is the 2nd derivative of position. 
    # If pos = ax^2 + bx + c, then vel = 2ax + b, acc = 2a.
    # The solver returns [c, b, a], so we take the 3rd element and multiply by 2.
    Enum.at(coeffs, 2, 0.0) * 2.0
  end

  # --- Ordinary Least Squares Solver (X'X)^-1 X'y ---
  defp solve_ols(x_matrix, y_vector) do
    try do
      # 1. Compute X'X (3x3 matrix)
      xtx = matrix_multiply_transpose(x_matrix)
      
      # 2. Compute X'y (3x1 vector)
      xty = vector_multiply_transpose(x_matrix, y_vector)
      
      # 3. Solve (X'X) * coeffs = (X'y) using Gaussian Elimination
      solve_linear_system(xtx, xty)
    rescue
      _ -> [0.0, 0.0, 0.0]
    end
  end

  defp matrix_multiply_transpose(x) do
    # Simulates Transpose(X) * X
    cols = 3
    for i <- 0..(cols-1) do
      for j <- 0..(cols-1) do
        Enum.reduce(x, 0.0, fn row, acc -> acc + (Enum.at(row, i) * Enum.at(row, j)) end)
      end
    end
  end

  defp vector_multiply_transpose(x, y) do
    # Simulates Transpose(X) * y
    cols = 3
    for i <- 0..(cols-1) do
      Enum.zip(x, y)
      |> Enum.reduce(0.0, fn {row, y_val}, acc -> acc + (Enum.at(row, i) * y_val) end)
    end
  end

  defp solve_linear_system(matrix, vector) do
    # Augmented Matrix [A | b]
    augmented = Enum.zip(matrix, vector) |> Enum.map(fn {row, b} -> row ++ [b] end)
    
    # Gaussian Elimination
    reduced = gaussian_elimination(augmented, 0)
    
    # Back Substitution
    back_substitute(reduced)
  end

  defp gaussian_elimination(matrix, col) when col >= 2, do: matrix
  defp gaussian_elimination(matrix, col) do
    pivot_row_idx = 
      matrix 
      |> Enum.with_index() 
      |> Enum.drop(col) 
      |> Enum.max_by(fn {row, _} -> abs(Enum.at(row, col)) end) 
      |> elem(1)

    matrix = swap_rows(matrix, col, pivot_row_idx)
    pivot = Enum.at(Enum.at(matrix, col), col)

    if abs(pivot) < 1.0e-10 do
      matrix
    else
      Enum.with_index(matrix)
      |> Enum.map(fn {row, i} ->
        if i > col do
          factor = Enum.at(row, col) / pivot
          Enum.zip(row, Enum.at(matrix, col)) |> Enum.map(fn {r, p} -> r - factor * p end)
        else
          row
        end
      end)
      |> gaussian_elimination(col + 1)
    end
  end

  defp back_substitute([r0, r1, r2]) do
    x2 = if abs(Enum.at(r2, 2)) > 1.0e-10, do: Enum.at(r2, 3) / Enum.at(r2, 2), else: 0.0
    x1 = if abs(Enum.at(r1, 1)) > 1.0e-10, do: (Enum.at(r1, 3) - Enum.at(r1, 2)*x2) / Enum.at(r1, 1), else: 0.0
    x0 = if abs(Enum.at(r0, 0)) > 1.0e-10, do: (Enum.at(r0, 3) - Enum.at(r0, 1)*x1 - Enum.at(r0, 2)*x2) / Enum.at(r0, 0), else: 0.0
    [x0, x1, x2]
  end

  defp swap_rows(matrix, i, j) do
    if i == j, do: matrix, else: List.replace_at(List.replace_at(matrix, i, Enum.at(matrix, j)), j, Enum.at(matrix, i))
  end
end